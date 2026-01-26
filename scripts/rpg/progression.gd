extends RefCounted
class_name RPGProgression

const MAX_LEVEL := 30
const STAT_CAP := 40

static func xp_to_next(level: int) -> int:
	var lvl = clamp(level, 1, MAX_LEVEL)
	return 100 + (lvl - 1) * 50

static func total_skill_points(level: int) -> int:
	var lvl = clamp(level, 1, MAX_LEVEL)
	return lvl

static func total_stat_points(level: int) -> int:
	var lvl = clamp(level, 1, MAX_LEVEL)
	return lvl * 3

static func stat_cost(next_value: int) -> int:
	if next_value <= 10:
		return 1
	if next_value <= 20:
		return 2
	if next_value <= 30:
		return 3
	return 4

static func can_raise_stat(value: int) -> bool:
	return value < STAT_CAP

static func apply_xp(unit: Unit, amount: int) -> Dictionary:
	if unit == null:
		return {"gained": 0, "levels": 0}
	var gained = max(0, amount)
	unit.xp += gained
	var levels_gained = 0
	while unit.level < MAX_LEVEL:
		var needed = xp_to_next(unit.level)
		if unit.xp < needed:
			break
		unit.xp -= needed
		unit.level += 1
		levels_gained += 1
		unit.skill_points += 1
		unit.stat_points += 3
	return {"gained": gained, "levels": levels_gained}

static func ensure_level_points(unit: Unit) -> void:
	if unit == null:
		return
	var expected_sp = total_skill_points(unit.level)
	var expected_stat = total_stat_points(unit.level)
	if unit.skill_points < expected_sp:
		unit.skill_points = expected_sp
	if unit.stat_points < expected_stat:
		unit.stat_points = expected_stat

static func allocate_stat_points(base_stats: Dictionary, points: int, weights: Dictionary) -> Dictionary:
	var stats = base_stats.duplicate(true)
	var remaining = max(0, points)
	if remaining == 0:
		return stats
	var weighted_keys: Array = []
	for key in weights.keys():
		weighted_keys.append(key)
	weighted_keys.sort_custom(func(a, b):
		return float(weights.get(b, 0.0)) < float(weights.get(a, 0.0))
	)
	if weighted_keys.is_empty():
		weighted_keys = ["STR", "DEX", "AGI", "VIT", "INT"]
	var guard = 0
	while remaining > 0 and guard < 500:
		for stat in weighted_keys:
			var current = int(stats.get(stat, 0))
			if not can_raise_stat(current):
				continue
			var cost = stat_cost(current + 1)
			if cost > remaining:
				continue
			stats[stat] = current + 1
			remaining -= cost
			if remaining <= 0:
				break
		guard += 1
		if guard > 480:
			break
	return stats

static func apply_stat_purchase(unit: Unit, stat_id: String) -> bool:
	if unit == null:
		return false
	var key = stat_id.to_upper()
	var current = int(unit.base_stats.get(key, 0))
	if not can_raise_stat(current):
		return false
	var cost = stat_cost(current + 1)
	if unit.stat_points < cost:
		return false
	unit.stat_points -= cost
	unit.base_stats[key] = current + 1
	return true

static func roll_level_for_tier(tier: int, rng: RandomNumberGenerator) -> int:
	var t = clamp(tier, 1, 4)
	if rng == null:
		rng = RandomNumberGenerator.new()
		rng.randomize()
	match t:
		1:
			return rng.randi_range(3, 5)
		2:
			return rng.randi_range(6, 10)
		3:
			return rng.randi_range(11, 15)
		4:
			return rng.randi_range(16, 20)
	return rng.randi_range(3, 5)
