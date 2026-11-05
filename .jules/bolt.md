## 2024-05-24 - Set Optimization

**Learning:** When collecting unique tags from all cells in a notebook, using a simple array and `.includes()` results in an O(n*m) complexity where n is total tags across all cells and m is number of unique tags. This can become a bottleneck when iterating over many cells with many tags in large notebooks.
**Action:** Use a `Set` to collect unique elements with O(1) insertion, and then convert it back to an array with `Array.from()`. This reduces the complexity to O(n) and improves performance significantly.
