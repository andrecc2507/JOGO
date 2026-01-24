extends RefCounted

const MISSION_TYPES := ["SKIRMISH", "ASSASSINATE", "DEFEND", "ESCORT", "CAPTURE"]
const DIFFICULTY_LABEL := {0: "Fácil", 1: "Média", 2: "Difícil"}

static func generate_hub_missions(seed: int, day: int) -> Array:
	var missions: Array = []
	for i in range(3):
		var rng := RandomNumberGenerator.new()
		rng.seed = seed + day * 31 + i * 19
		var difficulty = i
		var mission_def = _build_mission_def(rng, difficulty)
		var map_profile: Dictionary = mission_def.get("map_profile", {})
		var mission = _generate_map(map_profile, rng)
		mission.merge(mission_def, true)
		mission["seed"] = int(rng.seed)
		mission["difficulty"] = difficulty
		mission["id"] = "mission_%d_%d" % [day, i]
		missions.append({
			"id": mission["id"],
			"name": "%s (%s)" % [mission.get("title", "Missão"), DIFFICULTY_LABEL.get(difficulty, "")],
			"mission": mission
		})
	return missions

static func generate(map_w: int, map_h: int) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var mission_def = _build_mission_def(rng, 1)
	mission_def["map_profile"] = {"size": Vector2i(map_w, map_h), "cover_density": 0.45, "height_levels": 2}
	var mission = _generate_map(mission_def.get("map_profile", {}), rng)
	mission.merge(mission_def, true)
	mission["seed"] = int(rng.seed)
	mission["id"] = "mission_%d" % int(rng.seed)
	return mission

static func _build_mission_def(rng: RandomNumberGenerator, difficulty: int) -> Dictionary:
	var mission_type = MISSION_TYPES[rng.randi_range(0, MISSION_TYPES.size() - 1)]
	var map_profile = {
		"size": Vector2i(16, 16),
		"cover_density": clamp(0.4 + float(difficulty) * 0.1, 0.3, 0.6),
		"height_levels": 2 + difficulty
	}
	var enemy_profile = _enemy_profile_for(difficulty, mission_type)
	var objectives = _objectives_for(mission_type, rng)
	var extract_cell = Vector2i(14, 2)
	var capture_cell = Vector2i(-1, -1)
	var requires_extract = mission_type != "SKIRMISH"
	var turn_limit = 0
	for obj in objectives:
		if String(obj.get("type", "")) == "survive_turns":
			turn_limit = int(obj.get("turns", 4))
		if String(obj.get("type", "")) == "capture_tile":
			capture_cell = Vector2i(8, 8)
	var title = _title_for(mission_type)
	return {
		"type": mission_type,
		"title": title,
		"map_profile": map_profile,
		"enemy_profile": enemy_profile,
		"objectives": objectives,
		"extract_cell": extract_cell,
		"capture_cell": capture_cell,
		"requires_extract": requires_extract,
		"turn_limit": turn_limit,
		"loot_table_id": "basic",
		"loot_count": 1 + difficulty,
		"vip_required": mission_type == "ESCORT"
	}

static func _title_for(mission_type: String) -> String:
	match mission_type:
		"ASSASSINATE":
			return "Assassinato"
		"DEFEND":
			return "Defesa"
		"ESCORT":
			return "Escolta"
		"CAPTURE":
			return "Captura"
		_:
			return "Escaramuça"

static func _objectives_for(mission_type: String, rng: RandomNumberGenerator) -> Array:
	var objectives: Array = []
	match mission_type:
		"ASSASSINATE":
			objectives.append({"type": "kill_target", "text": "Eliminar o líder inimigo."})
		"DEFEND":
			var turns = rng.randi_range(4, 6)
			objectives.append({"type": "survive_turns", "turns": turns, "text": "Resista por %d turnos." % turns})
		"ESCORT":
			objectives.append({"type": "escort_unit_to_extract", "text": "Escolte o aliado até a extração."})
		"CAPTURE":
			objectives.append({"type": "capture_tile", "text": "Capture o ponto rúnico."})
		_:
			objectives.append({"type": "kill_all", "text": "Elimine todos os inimigos."})
	return objectives

static func _enemy_profile_for(difficulty: int, mission_type: String) -> Array:
	var base = 2 + difficulty
	var profile: Array = [
		{"archetype": "brute", "count": 1},
		{"archetype": "skirmisher", "count": base}
	]
	if mission_type in ["ASSASSINATE", "ESCORT", "CAPTURE"]:
		profile.append({"archetype": "caster", "count": 1 + difficulty})
	return profile

static func _generate_map(profile: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var size: Vector2i = profile.get("size", Vector2i(16, 16))
	var w = max(6, size.x)
	var h = max(6, size.y)
	var heights: Dictionary = {}
	var obstacles: Array[Dictionary] = []
	var height_levels = int(profile.get("height_levels", 2))
	var cover_density = float(profile.get("cover_density", 0.4))

	for p in range(2 + height_levels):
		var cx = rng.randi_range(3, w - 4)
		var cy = rng.randi_range(3, h - 4)
		var r = rng.randi_range(2, 4)
		var z = rng.randi_range(1, height_levels)
		for dx in range(-r, r + 1):
			for dy in range(-r, r + 1):
				if abs(dx) + abs(dy) > r:
					continue
				var x = cx + dx
				var y = cy + dy
				if x < 0 or y < 0 or x >= w or y >= h:
					continue
				heights[Vector2i(x, y)] = z

	var lines = rng.randi_range(2, 4)
	for i in range(lines):
		var y = rng.randi_range(4, h - 5)
		var x0 = rng.randi_range(2, w - 6)
		var length = rng.randi_range(3, 6)
		for x in range(x0, min(w - 2, x0 + length)):
			if rng.randf() > cover_density:
				continue
			obstacles.append({
				"cell": Vector2i(x, y),
				"mat": (Damage.MatType.WOOD if rng.randf() < 0.6 else Damage.MatType.STONE),
				"hp": rng.randi_range(8, 14)
			})

	var rocks = rng.randi_range(6, 10)
	for i in range(rocks):
		if rng.randf() > cover_density:
			continue
		var x = rng.randi_range(2, w - 3)
		var y = rng.randi_range(2, h - 3)
		obstacles.append({
			"cell": Vector2i(x, y),
			"mat": Damage.MatType.STONE,
			"hp": rng.randi_range(10, 18)
		})

	var p_spawn = [
		Vector2i(1, h - 2),
		Vector2i(2, h - 3),
		Vector2i(3, h - 4)
	]
	var e_spawn = [
		Vector2i(w - 3, 2),
		Vector2i(w - 4, 3),
		Vector2i(w - 3, 4),
		Vector2i(w - 5, 2)
	]

	return {
		"map_w": w,
		"map_h": h,
		"heights": heights,
		"obstacles": obstacles,
		"enemy_spawns": e_spawn,
		"player_spawns": p_spawn
	}
