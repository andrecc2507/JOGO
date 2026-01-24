# res://scripts/tactical/los.gd
extends RefCounted
class_name LOS

static func line(a: Vector2i, b: Vector2i) -> Array[Vector2i]:
	var pts: Array[Vector2i] = []
	var x0 = a.x
	var y0 = a.y
	var x1 = b.x
	var y1 = b.y
	var dx = abs(x1 - x0)
	var dy = -abs(y1 - y0)
	var sx = 1 if x0 < x1 else -1
	var sy = 1 if y0 < y1 else -1
	var err = dx + dy
	while true:
		pts.append(Vector2i(x0, y0))
		if x0 == x1 and y0 == y1:
			break
		var e2 = 2 * err
		if e2 >= dy:
			err += dy
			x0 += sx
		if e2 <= dx:
			err += dx
			y0 += sy
	return pts

static func dist3d(grid, a: Vector2i, b: Vector2i) -> float:
	var ax = float(a.x)
	var ay = float(a.y)
	var az = float(grid.get_height(a.x, a.y))
	var bx = float(b.x)
	var by = float(b.y)
	var bz = float(grid.get_height(b.x, b.y))
	var dx = ax - bx
	var dy = ay - by
	var dz = az - bz
	return sqrt(dx*dx + dy*dy + dz*dz)

static func can_see_unit(grid, viewer, target) -> bool:
	if grid == null or viewer == null or target == null:
		return false
	if target.dead:
		return false
	var cell: Vector2i = target.cell
	if not grid.in_bounds(cell.x, cell.y):
		return false
	var dist = dist3d(grid, viewer.cell, cell)
	var v = viewer.get("vis_range")
	var vis_range = int(v) if v != null else 8
	if dist > float(vis_range):
		return false
	var pts = line(viewer.cell, cell)
	for i in range(1, pts.size() - 1):
		var p = pts[i]
		if grid.has_obstacle(p.x, p.y):
			return false
	return true

# Cover relative to attacker (simple but useful)
static func cover_vs_attacker(grid, defender: Vector2i, attacker: Vector2i) -> Dictionary:
	var dx = attacker.x - defender.x
	var dy = attacker.y - defender.y

	var dir = Vector2i.ZERO
	if abs(dx) >= abs(dy):
		dir = Vector2i(1, 0) if dx > 0 else Vector2i(-1, 0)
	else:
		dir = Vector2i(0, 1) if dy > 0 else Vector2i(0, -1)

	var dir_name := "E"
	if dir == Vector2i(0, -1): dir_name = "N"
	elif dir == Vector2i(0, 1): dir_name = "S"
	elif dir == Vector2i(-1, 0): dir_name = "W"
	else: dir_name = "E"

	var front = defender + dir
	if grid.in_bounds(front.x, front.y) and grid.has_obstacle(front.x, front.y):
		return { "type": "FULL", "dir": dir, "dir_name": dir_name }

	var p1 = Vector2i(-dir.y, dir.x)
	var p2 = Vector2i(dir.y, -dir.x)
	var diag1 = defender + dir + p1
	var diag2 = defender + dir + p2
	if grid.in_bounds(diag1.x, diag1.y) and grid.has_obstacle(diag1.x, diag1.y):
		return { "type": "HALF", "dir": dir, "dir_name": dir_name }
	if grid.in_bounds(diag2.x, diag2.y) and grid.has_obstacle(diag2.x, diag2.y):
		return { "type": "HALF", "dir": dir, "dir_name": dir_name }

	return { "type": "NONE", "dir": dir, "dir_name": dir_name }
