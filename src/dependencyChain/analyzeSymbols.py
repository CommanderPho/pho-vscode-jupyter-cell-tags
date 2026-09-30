"""Extract defines, uses, and mutations from notebook cell sources.

Reads JSON {"cells": ["...", ...]} on stdin and writes a JSON array of
per-cell symbol info on stdout. Line magics (% / !) are stripped. A cell
magic (%%) or a syntax error is reported as parseError instead of guessing.
"""

import ast
import json
import sys

MUTATING_METHODS = {
    "append",
    "extend",
    "update",
    "add",
    "sort",
    "insert",
    "pop",
    "remove",
    "clear",
    "reverse",
    "discard",
    "setdefault",
}

_BUILTIN_NAMES = set(dir(__import__("builtins")))
_BUILTIN_NAMES.update({"display", "get_ipython"})


def _empty(parse_error=False):
    return {
        "defines": [],
        "uses": [],
        "mutations": [],
        "parseError": parse_error,
        "starImport": False,
        "dynamicExec": False,
    }


def _strip_magics(source):
    """Return cleaned source, or None when the cell is a %% cell magic."""
    lines = source.splitlines()
    for line in lines:
        if line.lstrip().startswith("%%"):
            return None
        ## END for line in lines....

    kept = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("%") or stripped.startswith("!"):
            continue
        kept.append(line)
    ## END for line in lines....

    return "\n".join(kept)


def _root_name(node):
    seen = 0
    while seen < 40 and isinstance(node, (ast.Attribute, ast.Subscript)):
        node = node.value
        seen += 1
    ## END while seen < 40 and isinstance(node, (ast.Attribute, ast.Subscript))....

    if isinstance(node, ast.Name):
        return node.id
    return None


def _pattern_names(pattern):
    names = []
    if isinstance(pattern, ast.MatchAs):
        if pattern.name:
            names.append(pattern.name)
        if pattern.pattern:
            names.extend(_pattern_names(pattern.pattern))
    elif isinstance(pattern, ast.MatchStar):
        if pattern.name:
            names.append(pattern.name)
    elif isinstance(pattern, ast.MatchMapping):
        for child in pattern.patterns:
            names.extend(_pattern_names(child))
        ## END for child in pattern.patterns....

        if pattern.rest:
            names.append(pattern.rest)
    elif isinstance(pattern, (ast.MatchSequence, ast.MatchOr)):
        for child in pattern.patterns:
            names.extend(_pattern_names(child))
        ## END for child in pattern.patterns....

    elif isinstance(pattern, ast.MatchClass):
        for child in pattern.patterns:
            names.extend(_pattern_names(child))
        ## END for child in pattern.patterns....

        for child in pattern.kwd_patterns:
            names.extend(_pattern_names(child))
        ## END for child in pattern.kwd_patterns....

    return names


class _DefCollector(ast.NodeVisitor):
    """Names assigned at cell top level (and globals declared in functions)."""

    def __init__(self):
        self.defs = set()
        self.scope_depth = 0
        self.global_names = [set()]

    def _push(self):
        self.scope_depth += 1
        self.global_names.append(set())

    def _pop(self):
        self.scope_depth -= 1
        self.global_names.pop()

    def _record(self, name):
        if self.scope_depth == 0 or name in self.global_names[-1]:
            self.defs.add(name)

    def visit_FunctionDef(self, node):
        self._record(node.name)
        self._push()
        self.generic_visit(node)
        self._pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        self._record(node.name)
        self._push()
        self.generic_visit(node)
        self._pop()

    def visit_Lambda(self, node):
        self._push()
        self.generic_visit(node)
        self._pop()

    def visit_ListComp(self, node):
        self._push()
        self.generic_visit(node)
        self._pop()

    visit_SetComp = visit_ListComp
    visit_DictComp = visit_ListComp
    visit_GeneratorExp = visit_ListComp

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Store):
            self._record(node.id)

    def visit_Global(self, node):
        self.global_names[-1].update(node.names)

    def visit_Import(self, node):
        if self.scope_depth == 0:
            for alias in node.names:
                self.defs.add((alias.asname or alias.name).split(".")[0])
            ## END for alias in node.names....

    def visit_ImportFrom(self, node):
        if self.scope_depth != 0:
            return
        for alias in node.names:
            if alias.name != "*":
                self.defs.add(alias.asname or alias.name)
        ## END for alias in node.names....

    def visit_ExceptHandler(self, node):
        if isinstance(node.name, str):
            self._record(node.name)
        self.generic_visit(node)

    def visit_Match(self, node):
        self.visit(node.subject)
        for case in node.cases:
            if self.scope_depth == 0:
                for name in _pattern_names(case.pattern):
                    self.defs.add(name)
                ## END for name in _pattern_names(case.pattern)....

            if case.guard:
                self.visit(case.guard)
            for stmt in case.body:
                self.visit(stmt)
            ## END for stmt in case.body....

        ## END for case in node.cases....


class _UseCollector(ast.NodeVisitor):
    def __init__(self, cell_level_defs):
        self.cell_level_defs = set(cell_level_defs)
        self.defined_so_far = set()
        self.scopes = []
        self.global_stack = []
        self.defines = set()
        self.uses = set()
        self.mutations = set()
        self.star_import = False
        self.dynamic_exec = False

    def _push(self, names):
        self.scopes.append(set(names))
        self.global_stack.append(set())

    def _pop(self):
        self.scopes.pop()
        self.global_stack.pop()

    def _is_local(self, name):
        for scope in self.scopes:
            if name in scope:
                return True
        ## END for scope in self.scopes....

        return False

    def _is_global(self, name):
        return bool(self.global_stack) and name in self.global_stack[-1]

    def _note_use(self, name):
        if not name or name in _BUILTIN_NAMES:
            return
        if self._is_local(name) and not self._is_global(name):
            return
        if self.scopes:
            if name not in self.cell_level_defs:
                self.uses.add(name)
            return
        if name not in self.defined_so_far:
            self.uses.add(name)

    def _define(self, name):
        if not name:
            return
        if self.scopes and not self._is_global(name):
            self.scopes[-1].add(name)
            return
        self.defines.add(name)
        self.defined_so_far.add(name)
        self.cell_level_defs.add(name)

    def _mutate(self, name):
        if not name:
            return
        if name in _BUILTIN_NAMES and name not in self.cell_level_defs and name not in self.defined_so_far:
            return
        if self._is_local(name) and not self._is_global(name):
            return
        self.mutations.add(name)
        if not self.scopes:
            self.defined_so_far.add(name)

    def _bind_args(self, args, scope):
        for default in list(args.defaults) + [d for d in args.kw_defaults if d is not None]:
            self.visit(default)
        ## END for default in list(args.defaults) + [d for d in args.kw_defaults if d is not None]....

        for arg in list(args.posonlyargs) + list(args.args) + list(args.kwonlyargs):
            scope.add(arg.arg)
        ## END for arg in list(args.posonlyargs) + list(args.args) + list(args.kwonlyargs)....

        if args.vararg:
            scope.add(args.vararg.arg)
        if args.kwarg:
            scope.add(args.kwarg.arg)

    def _visit_comprehension(self, generators, visit_body):
        # The first iterable is evaluated outside the comprehension scope.
        if generators:
            self.visit(generators[0].iter)
        scope = set()
        self._push(scope)
        for index, gen in enumerate(generators):
            if index > 0:
                self.visit(gen.iter)
            self._bind_target(gen.target)
            for test in gen.ifs:
                self.visit(test)
            ## END for test in gen.ifs....

        ## END for index, gen in enumerate(generators)....

        visit_body()
        self._pop()

    def _bind_target(self, target):
        if isinstance(target, ast.Name):
            self._define(target.id)
        elif isinstance(target, (ast.Tuple, ast.List)):
            for elt in target.elts:
                self._bind_target(elt)
            ## END for elt in target.elts....

        elif isinstance(target, ast.Starred):
            self._bind_target(target.value)
        elif isinstance(target, ast.Subscript):
            self._mutate_subscript(target)
            self.visit(target.slice)
        elif isinstance(target, ast.Attribute):
            root = _root_name(target)
            if root:
                self._note_use(root)
                self._mutate(root)

    def _mutate_subscript(self, node):
        base = node.value
        if isinstance(base, ast.Attribute) and base.attr in ("loc", "iloc"):
            root = _root_name(base.value)
            if root:
                self._note_use(root)
                self._mutate(root)
            return
        if isinstance(base, ast.Name):
            self._note_use(base.id)
            self._mutate(base.id)
            return
        self.visit(base)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            self._note_use(node.id)

    def visit_Assign(self, node):
        self.visit(node.value)
        for target in node.targets:
            self._bind_target(target)
        ## END for target in node.targets....

    def visit_AnnAssign(self, node):
        if node.annotation:
            self.visit(node.annotation)
        if node.value:
            self.visit(node.value)
            self._bind_target(node.target)

    def visit_AugAssign(self, node):
        self.visit(node.value)
        if isinstance(node.target, ast.Name):
            self._note_use(node.target.id)
            self._define(node.target.id)
        else:
            self._bind_target(node.target)

    def visit_NamedExpr(self, node):
        self.visit(node.value)
        if isinstance(node.target, ast.Name):
            self._define(node.target.id)

    def visit_Call(self, node):
        self.visit(node.func)
        for arg in node.args:
            self.visit(arg)
        ## END for arg in node.args....

        inplace = False
        for keyword in node.keywords:
            if keyword.value:
                self.visit(keyword.value)
            if (
                keyword.arg == "inplace"
                and isinstance(keyword.value, ast.Constant)
                and keyword.value.value is True
            ):
                inplace = True
        ## END for keyword in node.keywords....

        func = node.func
        if isinstance(func, ast.Name) and func.id in ("exec", "eval"):
            self.dynamic_exec = True
        if isinstance(func, ast.Attribute):
            method = func.attr
            if inplace or method in MUTATING_METHODS:
                root = _root_name(func.value)
                if root:
                    self._mutate(root)

    def visit_FunctionDef(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        ## END for decorator in node.decorator_list....

        scope = set()
        self._bind_args(node.args, scope)
        self._define(node.name)
        if node.returns:
            self.visit(node.returns)
        self._push(scope)
        for stmt in node.body:
            self.visit(stmt)
        ## END for stmt in node.body....

        self._pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        ## END for decorator in node.decorator_list....

        for base in node.bases:
            self.visit(base)
        ## END for base in node.bases....

        for keyword in node.keywords:
            if keyword.value:
                self.visit(keyword.value)
        ## END for keyword in node.keywords....

        self._define(node.name)
        self._push(set())
        for stmt in node.body:
            self.visit(stmt)
        ## END for stmt in node.body....

        self._pop()

    def visit_Lambda(self, node):
        scope = set()
        self._bind_args(node.args, scope)
        self._push(scope)
        self.visit(node.body)
        self._pop()

    def visit_For(self, node):
        self.visit(node.iter)
        self._bind_target(node.target)
        for stmt in node.body:
            self.visit(stmt)
        ## END for stmt in node.body....

        for stmt in node.orelse:
            self.visit(stmt)
        ## END for stmt in node.orelse....

    visit_AsyncFor = visit_For

    def visit_With(self, node):
        for item in node.items:
            self.visit(item.context_expr)
            if item.optional_vars:
                self._bind_target(item.optional_vars)
        ## END for item in node.items....

        for stmt in node.body:
            self.visit(stmt)
        ## END for stmt in node.body....

    visit_AsyncWith = visit_With

    def visit_ExceptHandler(self, node):
        if node.type:
            self.visit(node.type)
        if isinstance(node.name, str):
            self._define(node.name)
        for stmt in node.body:
            self.visit(stmt)
        ## END for stmt in node.body....

    def visit_Import(self, node):
        for alias in node.names:
            bound = alias.asname or alias.name.split(".")[0]
            self._define(bound)
        ## END for alias in node.names....

    def visit_ImportFrom(self, node):
        for alias in node.names:
            if alias.name == "*":
                self.star_import = True
            else:
                self._define(alias.asname or alias.name)
        ## END for alias in node.names....

    def visit_ListComp(self, node):
        def visit_body():
            self.visit(node.elt)

        self._visit_comprehension(node.generators, visit_body)

    def visit_SetComp(self, node):
        def visit_body():
            self.visit(node.elt)

        self._visit_comprehension(node.generators, visit_body)

    def visit_DictComp(self, node):
        def visit_body():
            self.visit(node.key)
            self.visit(node.value)

        self._visit_comprehension(node.generators, visit_body)

    def visit_GeneratorExp(self, node):
        def visit_body():
            self.visit(node.elt)

        self._visit_comprehension(node.generators, visit_body)

    def visit_Match(self, node):
        self.visit(node.subject)
        for case in node.cases:
            for name in _pattern_names(case.pattern):
                self._define(name)
            ## END for name in _pattern_names(case.pattern)....

            if case.guard:
                self.visit(case.guard)
            for stmt in case.body:
                self.visit(stmt)
            ## END for stmt in case.body....

        ## END for case in node.cases....


def analyze_cell(source):
    cleaned = _strip_magics(source)
    if cleaned is None:
        return _empty(parse_error=True)
    if cleaned.strip() == "":
        return _empty()
    try:
        tree = ast.parse(cleaned)
    except SyntaxError:
        return _empty(parse_error=True)

    collector = _DefCollector()
    collector.visit(tree)
    uses = _UseCollector(collector.defs)
    uses.visit(tree)
    return {
        "defines": sorted(uses.defines),
        "uses": sorted(uses.uses),
        "mutations": sorted(uses.mutations),
        "parseError": False,
        "starImport": uses.star_import,
        "dynamicExec": uses.dynamic_exec,
    }


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        cells = payload.get("cells", [])
        if not isinstance(cells, list):
            raise ValueError("Expected {\"cells\": [string, ...]}")
        result = []
        for source in cells:
            result.append(analyze_cell(source if isinstance(source, str) else ""))
        ## END for source in cells....

        json.dump({"cells": result}, sys.stdout)
    except Exception as exc:
        sys.stderr.write(str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
