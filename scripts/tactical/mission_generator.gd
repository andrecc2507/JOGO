extends RefCounted
class_name MissionGenerator

enum Objective { ELIMINATE, EXTRACT, DEFEND }

static func generate(seed: int, w: int, h: int) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed

	var heights: Dictionary = {}
	var obstacles: Array[Dictionary] = []

	# alturas: 2-3 platôs
	for p in range(3):
		var cx = rng.randi_range(3, w - 4)
		var cy = rng.randi_range(3, h - 4)
		var r = rng.randi_range(2, 4)
		var z = rng.randi_range(1, 3)
		for dx in range(-r, r + 1):
			for dy in range(-r, r + 1):
				if abs(dx) + abs(dy) > r: continue
				var x = cx + dx
				var y = cy + dy
				if x < 0 or y < 0 or x >= w or y >= h: continue
				heights[Vector2i(x, y)] = z

	# obstáculos: linhas e pedras
	var lines = rng.randi_range(2, 4)
	for i in range(lines):
		var y = rng.randi_range(4, h - 5)
		var x0 = rng.randi_range(2, w - 6)
		var len = rng.randi_range(3, 6)
		for x in range(x0, min(w - 2, x0 + len)):
			obstacles.append({
				"cell": Vector2i(x, y),
				"mat": (Damage.MatType.WOOD if rng.randf() < 0.6 else Damage.MatType.STONE),
				"hp": rng.randi_range(8, 14)
			})

	var rocks = rng.randi_range(6, 12)
	for i in range(rocks):
		var x = rng.randi_range(2, w - 3)
		var y = rng.randi_range(2, h - 3)
		obstacles.append({
			"cell": Vector2i(x, y),
			"mat": Damage.MatType.STONE,
			"hp": rng.randi_range(10, 18)
		})

	# objetivo
	var obj = Objective.ELIMINATE
	var roll = rng.randi_range(1, 100)
	if roll <= 35:
		obj = Objective.EXTRACT
	elif roll <= 60:
		obj = Objective.DEFEND

	# spawns
	var p_spawn = [Vector2i(2, 2), Vector2i(2, 4)]
	var e_spawn = [Vector2i(w - 3, h - 3), Vector2i(w - 4, h - 4), Vector2i(w - 3, h - 5)]

	var extract_cell = Vector2i(w - 2, 2)

	return {
		"heights": heights,
		"obstacles": obstacles,
		"objective": obj,
		"player_spawns": p_spawn,
		"enemy_spawns": e_spawn,
		"extract_cell": extract_cell,
		"seed": seed
	}
