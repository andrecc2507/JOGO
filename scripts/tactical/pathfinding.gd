extends RefCounted
class_name Pathfinding

static func reachable_with_pa(grid: GridData, start: Vector2i, pa: int, mover: Unit) -> Dictionary:
	var out: Dictionary = {}
	if pa < 0:
		return out

	var open: Array[Vector2i] = [start]
	out[start] = 0

	var dirs = [Vector2i(1,0), Vector2i(-1,0), Vector2i(0,1), Vector2i(0,-1)]

	while not open.is_empty():
		open.sort_custom(func(a, b): return int(out.get(a, INF)) < int(out.get(b, INF)))
		var c = open.pop_front()
		var cost = int(out[c])
		for d in dirs:
			var n = c + d
			if not grid.in_bounds(n.x, n.y):
				continue
			if not grid.is_walkable(n.x, n.y):
				continue
			var step_cost = _step_cost(grid, c, n, mover)
			if step_cost >= INF:
				continue
			var nc = cost + step_cost
			if nc > pa:
				continue
			if not out.has(n) or nc < int(out[n]):
				out[n] = nc
				if not open.has(n):
					open.append(n)
	return out

static func find_path(grid: GridData, start: Vector2i, goal: Vector2i, mover: Unit) -> Array[Vector2i]:
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
			if not grid.in_bounds(n.x, n.y):
				continue
			if not grid.is_walkable(n.x, n.y):
				continue

			var step_cost = _step_cost(grid, cur, n, mover)
			if step_cost >= INF:
				continue
			var tent = int(g[cur]) + step_cost
			if not g.has(n) or tent < int(g[n]):
				came[n] = cur
				g[n] = tent
				f[n] = float(tent) + _h(n, goal)
				if not open.has(n):
					open.append(n)
	return []

static func _h(a: Vector2i, b: Vector2i) -> float:
	return float(abs(a.x - b.x) + abs(a.y - b.y))

static func step_cost(grid: GridData, from: Vector2i, to: Vector2i, mover: Unit) -> int:
	return _step_cost(grid, from, to, mover)

static func _step_cost(grid: GridData, from: Vector2i, to: Vector2i, mover: Unit) -> int:
	if mover == null:
		return INF
	var terrain = grid.get_terrain(to.x, to.y)
	if terrain == GridData.Terrain.WATER:
		return INF

	var base_cost = 1
	if terrain == GridData.Terrain.DIFFICULT:
		base_cost += 1
	elif terrain == GridData.Terrain.RUGGED:
		base_cost += 2

	var dh = grid.get_height(to.x, to.y) - grid.get_height(from.x, from.y)
	if dh > mover.get_jump():
		return INF
	if dh > 0:
		base_cost += dh

	var mult = max(0.2, mover.get_move_multiplier())
	return max(1, int(round(float(base_cost) / mult)))

static func _reconstruct(came: Dictionary, cur: Vector2i) -> Array[Vector2i]:
	var path: Array[Vector2i] = [cur]
	while came.has(cur):
		cur = came[cur]
		path.push_front(cur)
	return path
