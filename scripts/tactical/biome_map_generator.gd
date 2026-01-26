class_name BiomeMapGenerator
extends RefCounted

const BIOMES_PATH := "res://content/biomes.json"

static var _cached_biomes: Dictionary = {}

static func generate(seed: int, biome_id: String, mission_type: String, difficulty: int, profile: Dictionary = {}) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var biome_profile: Dictionary = _resolve_biome_profile(biome_id)
	var merged_profile: Dictionary = biome_profile.duplicate(true)
	for key in profile.keys():
		merged_profile[key] = profile[key]
	var size_range: Array = merged_profile.get("map_size_range", [14, 18])
	var min_size: int = int(size_range[0]) if size_range.size() > 0 else 14
	var max_size: int = int(size_range[1]) if size_range.size() > 1 else min_size
	if max_size < min_size:
		max_size = min_size
	var w: int = rng.randi_range(min_size, max_size)
	var h: int = rng.randi_range(min_size, max_size)
	var size: Vector2i = Vector2i(w, h)
	var height_levels: int = int(merged_profile.get("height_levels", 2))
	var cover_density: float = float(merged_profile.get("cover_density", 0.45))
	var obstacle_mix: Dictionary = merged_profile.get("obstacle_mix", {"wood": 0.6, "stone": 0.4})
	var map_data: Dictionary = _build_base_map(rng, size, height_levels, cover_density, obstacle_mix)
	var spawn_rules: Dictionary = merged_profile.get("spawn_rules", {})
	var min_spawn_distance: int = int(spawn_rules.get("min_spawn_distance", 6))
	var spawns: Dictionary = _place_spawns(rng, size, map_data.get("obstacles", []), min_spawn_distance)
	map_data["player_spawns"] = spawns.get("player_spawns", [])
	map_data["enemy_spawns"] = spawns.get("enemy_spawns", [])
	map_data["biome_id"] = biome_id
	map_data["mission_type"] = mission_type
	map_data["difficulty"] = difficulty
	map_data["map_profile"] = {
		"size": size,
		"height_levels": height_levels,
		"cover_density": cover_density,
		"obstacle_mix": obstacle_mix
	}
	return map_data

static func _resolve_biome_profile(biome_id: String) -> Dictionary:
	if _cached_biomes.is_empty():
		_cached_biomes = _load_biomes()
	if _cached_biomes.has(biome_id):
		return _cached_biomes[biome_id]
	if not _cached_biomes.is_empty():
		return _cached_biomes.values()[0]
	return {}

static func _load_biomes() -> Dictionary:
	var out: Dictionary = {}
	if not FileAccess.file_exists(BIOMES_PATH):
		return out
	var file := FileAccess.open(BIOMES_PATH, FileAccess.READ)
	if file == null:
		return out
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		for entry in parsed.get("biomes", []):
			var biome_id := String(entry.get("id", ""))
			if biome_id != "":
				out[biome_id] = entry
	return out

static func _build_base_map(rng: RandomNumberGenerator, size: Vector2i, height_levels: int, cover_density: float, obstacle_mix: Dictionary) -> Dictionary:
	var heights: Dictionary = {}
	var obstacles: Array[Dictionary] = []
	var w: int = max(6, size.x)
	var h: int = max(6, size.y)
	for p in range(1 + height_levels):
		var cx: int = rng.randi_range(2, w - 3)
		var cy: int = rng.randi_range(2, h - 3)
		var r: int = rng.randi_range(2, 4)
		var z: int = rng.randi_range(1, max(1, height_levels))
		for dx in range(-r, r + 1):
			for dy in range(-r, r + 1):
				if abs(dx) + abs(dy) > r:
					continue
				var x: int = cx + dx
				var y: int = cy + dy
				if x < 0 or y < 0 or x >= w or y >= h:
					continue
				heights[Vector2i(x, y)] = z

	var target_obstacles: int = int(float(w * h) * clamp(cover_density, 0.2, 0.7) * 0.2)
	var placed: int = 0
	var tries: int = 0
	while placed < target_obstacles and tries < target_obstacles * 6:
		tries += 1
		if rng.randf() > cover_density:
			continue
		var x: int = rng.randi_range(1, w - 2)
		var y: int = rng.randi_range(1, h - 2)
		var cell := Vector2i(x, y)
		var blocked := false
		for existing in obstacles:
			if existing.get("cell", Vector2i(-1, -1)) == cell:
				blocked = true
				break
		if blocked:
			continue
		obstacles.append({
			"cell": cell,
			"mat": _pick_obstacle_material(obstacle_mix, rng),
			"hp": rng.randi_range(8, 14)
		})
		placed += 1
	return {
		"size": size,
		"heights": heights,
		"obstacles": obstacles
	}

static func _place_spawns(rng: RandomNumberGenerator, size: Vector2i, obstacles: Array, min_distance: int) -> Dictionary:
	var player_spawns: Array = []
	var enemy_spawns: Array = []
	var attempts: int = 0
	while attempts < 10:
		attempts += 1
		player_spawns = [
			Vector2i(rng.randi_range(1, 2), rng.randi_range(size.y - 3, size.y - 2)),
			Vector2i(rng.randi_range(2, 3), rng.randi_range(size.y - 4, size.y - 3))
		]
		enemy_spawns = [
			Vector2i(rng.randi_range(size.x - 3, size.x - 2), rng.randi_range(1, 2)),
			Vector2i(rng.randi_range(size.x - 4, size.x - 3), rng.randi_range(2, 3))
		]
		if _spawns_valid(player_spawns, enemy_spawns, obstacles, min_distance):
			return {"player_spawns": player_spawns, "enemy_spawns": enemy_spawns}
	return {
		"player_spawns": [Vector2i(1, size.y - 2), Vector2i(2, size.y - 3)],
		"enemy_spawns": [Vector2i(size.x - 2, 1), Vector2i(size.x - 3, 2)]
	}

static func _spawns_valid(player_spawns: Array, enemy_spawns: Array, obstacles: Array, min_distance: int) -> bool:
	for p in player_spawns:
		for e in enemy_spawns:
			if p.distance_to(e) < float(min_distance):
				return false
	for spawn in player_spawns + enemy_spawns:
		for ob in obstacles:
			if ob.get("cell", Vector2i(-1, -1)) == spawn:
				return false
	return true

static func _pick_obstacle_material(obstacle_mix: Dictionary, rng: RandomNumberGenerator) -> int:
	var roll: float = rng.randf()
	var total: float = 0.0
	for key in obstacle_mix.keys():
		total += float(obstacle_mix.get(key, 0.0))
	var accum: float = 0.0
	for key in obstacle_mix.keys():
		var weight: float = float(obstacle_mix.get(key, 0.0)) / max(0.001, total)
		accum += weight
		if roll <= accum:
			return _mat_from_key(String(key))
	return _mat_from_key(String(obstacle_mix.keys()[0]))

static func _mat_from_key(key: String) -> int:
	match key:
		"stone":
			return 1
		"metal":
			return 2
		_:
			return 0
