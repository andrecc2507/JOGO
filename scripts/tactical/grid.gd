extends RefCounted
class_name GridData

var w: int
var h: int
var tile_size: float = 1.0

var _height: PackedInt32Array
var _walkable: PackedByteArray
var _obs_mat: PackedInt32Array
var _obs_hp: PackedInt32Array
var _terrain: PackedInt32Array

enum Terrain { NORMAL, DIFFICULT, WATER, RUGGED }

func _init(_w: int, _h: int, _tile_size: float = 1.0) -> void:
	w = _w
	h = _h
	tile_size = _tile_size

	_height = PackedInt32Array()
	_height.resize(w * h)

	_walkable = PackedByteArray()
	_walkable.resize(w * h)
	for i in range(w * h):
		_walkable[i] = 1

	_obs_mat = PackedInt32Array()
	_obs_mat.resize(w * h)
	for i in range(w * h):
		_obs_mat[i] = -1

	_obs_hp = PackedInt32Array()
	_obs_hp.resize(w * h)
	for i in range(w * h):
		_obs_hp[i] = 0

	_terrain = PackedInt32Array()
	_terrain.resize(w * h)
	for i in range(w * h):
		_terrain[i] = Terrain.NORMAL

func idx(x: int, y: int) -> int:
	return y * w + x

func in_bounds(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < w and y < h

func set_height(x: int, y: int, z: int) -> void:
	if not in_bounds(x, y): return
	_height[idx(x, y)] = z

func get_height(x: int, y: int) -> int:
	if not in_bounds(x, y): return 0
	return _height[idx(x, y)]

func set_walkable(x: int, y: int, ok: bool) -> void:
	if not in_bounds(x, y): return
	_walkable[idx(x, y)] = 1 if ok else 0

func is_walkable(x: int, y: int) -> bool:
	if not in_bounds(x, y): return false
	return _walkable[idx(x, y)] == 1

func has_obstacle(x: int, y: int) -> bool:
	if not in_bounds(x, y): return false
	return _obs_mat[idx(x, y)] != -1

func set_obstacle(x: int, y: int, mat: int, hp: int) -> void:
	if not in_bounds(x, y): return
	_obs_mat[idx(x, y)] = mat
	_obs_hp[idx(x, y)] = max(1, hp)
	set_walkable(x, y, false)

func clear_obstacle(x: int, y: int) -> void:
	if not in_bounds(x, y): return
	_obs_mat[idx(x, y)] = -1
	_obs_hp[idx(x, y)] = 0
	set_walkable(x, y, true)

func get_obstacle_mat(x: int, y: int) -> int:
	if not in_bounds(x, y): return -1
	return _obs_mat[idx(x, y)]

func get_obstacle_hp(x: int, y: int) -> int:
	if not in_bounds(x, y): return 0
	return _obs_hp[idx(x, y)]

func damage_obstacle(x: int, y: int, dmg: int) -> bool:
	if not has_obstacle(x, y):
		return false
	var i = idx(x, y)
	_obs_hp[i] -= max(0, dmg)
	if _obs_hp[i] <= 0:
		clear_obstacle(x, y)
		return true
	return false

func set_terrain(x: int, y: int, terrain: int) -> void:
	if not in_bounds(x, y): return
	_terrain[idx(x, y)] = terrain

func get_terrain(x: int, y: int) -> int:
	if not in_bounds(x, y): return Terrain.NORMAL
	return _terrain[idx(x, y)]

func cell_to_world(x: int, y: int) -> Vector3:
	var z = float(get_height(x, y))
	return Vector3(float(x) * tile_size + tile_size * 0.5, z, float(y) * tile_size + tile_size * 0.5)

func world_to_cell(p: Vector3) -> Vector2i:
	var x = int(floor(p.x / tile_size))
	var y = int(floor(p.z / tile_size))
	return Vector2i(x, y)
