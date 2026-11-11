## 2023-10-27 - [Performance of Set vs includes]
**Learning:** Set.add() and Array.from(Set) is faster than Array.prototype.includes() in O(n) loops, particularly when keeping order intact.
**Action:** Convert arrays containing unique elements that might be filtered using includes into Sets to prevent O(N^2) loops.
