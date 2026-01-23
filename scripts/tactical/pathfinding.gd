extends RefCounted
class_name Pathfinding

static func reachable_with_pa(grid: GridData, start: Vector2i, pa: int) -> Dictionary:
	var out: Dictionary = {}
	if pa < 0: return out

	var q: Array[Vector2i] = []
	out[start] = 0
	q.append(start)

	var dirs = [Vector2i(1,0), Vector2i(-1,0), Vector2i(0,1), Vector2i(0,-1)]

	while not q.is_empty():
		var c = q.pop_front()
		var cost = int(out[c])
		for d in dirs:
			var n = c + d
			if not grid.in_bounds(n.x, n.y): continue
			if not grid.is_walkable(n.x, n.y): continue
			var nc = cost + 1
			if nc > pa: continue
			if not out.has(n) or nc < int(out[n]):
				out[n] = nc
				q.append(n)
	return out

static func find_path(grid: GridData, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	if start == goal:
		return [start]
	if not grid.in_bounds(goal.x, goal.y) or not grid.is_walkable(goal.x, goal.y):
		return []

	var open: Array[Vector2i] = [start]
	var came: Dictionary = {}
	var g: Dictionary = { start: 0 }
	var f: Dictionary = { start: _h(start, goal) }

	var dirs = [Vector2i(1,0), Vector2i(-1,0), Vector2i(0,1), Vector2i(0,-1)]

	while not open.is_empty():
		open.sort_custom(func(a, b): return float(f.get(a, INF)) < float(f.get(b, INF)))
		var cur = open.pop_front()

		if cur == goal:
			return _reconstruct(came, cur)

		for d in dirs:
			var n = cur + d
			if not grid.in_bounds(n.x, n.y): continue
			if not grid.is_walkable(n.x, n.y): continue

			var tent = int(g[cur]) + 1
			if not g.has(n) or tent < int(g[n]):
				came[n] = cur
				g[n] = tent
				f[n] = float(tent) + _h(n, goal)
				if not open.has(n):
					open.append(n)
	return []

static func _h(a: Vector2i, b: Vector2i) -> float:
	return float(abs(a.x - b.x) + abs(a.y - b.y))

static func _reconstruct(came: Dictionary, cur: Vector2i) -> Array[Vector2i]:
	var path: Array[Vector2i] = [cur]
	while came.has(cur):
		cur = came[cur]
		path.push_front(cur)
	return path
