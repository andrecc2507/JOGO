# res://scripts/tactical/ai.gd
extends RefCounted
class_name TacticalAI


const DECISIONS_PER_TURN := 3
const LOW_HP_RATIO := 0.4
const MIN_ATTACK_SCORE := 25.0


func take_turn(controller: TacticalController, enemy: Unit) -> void:
	if enemy == null or enemy.dead:
		return
	if enemy.casting:
		controller._resolve_cast_if_ready(enemy)
		return

	var decisions = 0
	while enemy.pa > 0 and decisions < DECISIONS_PER_TURN:
		var choice = _choose_action(controller, enemy)
		if choice.is_empty():
			enemy.pa = 0
			return

		var acted = false
		match choice.type:
			"SHOOT":
				acted = _do_shoot(controller, enemy, choice)
			"MELEE":
				acted = _do_melee(controller, enemy, choice)
			"ABILITY":
				acted = _do_ability(controller, enemy, choice)
			"MOVE":
				acted = _do_move(controller, enemy, choice)
			"OVERWATCH":
				acted = _do_overwatch(controller, enemy, choice)

		if not acted:
			enemy.pa = 0
			return
		decisions += 1
	if enemy.pa > 0:
		enemy.pa = 0


func _choose_action(controller: TacticalController, enemy: Unit) -> Dictionary:
	var shoot_choice = _best_shot(controller, enemy)
	var melee_choice = _best_melee(controller, enemy)
	var ability_choice = _best_ability(controller, enemy)
	var move_choice = _best_move(controller, enemy)
	var overwatch_choice = _best_overwatch(controller, enemy)

	var best = _pick_best([melee_choice, shoot_choice, ability_choice, move_choice, overwatch_choice])
	if best.is_empty():
		return {}

	if best.type in ["SHOOT", "ABILITY"]:
		if best.score < MIN_ATTACK_SCORE:
			return overwatch_choice if not overwatch_choice.is_empty() else move_choice

	return best


func _pick_best(choices: Array) -> Dictionary:
	var best_score = -INF
	var best: Dictionary = {}
	for c in choices:
		if c.is_empty():
			continue
		if c.score > best_score:
			best_score = c.score
			best = c
	return best


func _do_shoot(controller: TacticalController, enemy: Unit, choice: Dictionary) -> bool:
	var target: Unit = choice.target
	if target == null:
		return false
	if not enemy.spend_pa(controller.SHOOT_COST):
		return false
	controller._try_attack(enemy, target, false)
	print("AI: chose SHOOT %s score=%.1f" % [target.unit_name, float(choice.score)])
	return true


func _do_melee(controller: TacticalController, enemy: Unit, choice: Dictionary) -> bool:
	var target: Unit = choice.target
	if target == null:
		return false
	if not enemy.spend_pa(controller.MELEE_COST):
		return false
	controller._try_melee_attack(enemy, target, false)
	print("AI: chose MELEE %s score=%.1f" % [target.unit_name, float(choice.score)])
	return true


func _do_ability(controller: TacticalController, enemy: Unit, choice: Dictionary) -> bool:
	var ability: Dictionary = choice.ability
	if ability.is_empty():
		return false
	var cost := int(ability.get("cost_pa", 0))
	if enemy.pa < cost:
		return false

	var target_mode := int(ability.get("target_mode", Abilities.TargetMode.CELL))
	var target_cell: Vector2i = choice.get("cell", enemy.cell)
	var target_unit: Unit = choice.get("target", null)
	if target_mode == Abilities.TargetMode.CELL:
		controller._cast_ability_on_cell(enemy, ability, target_cell)
	elif target_mode == Abilities.TargetMode.UNIT:
		if target_unit == null:
			return false
		controller._cast_ability_on_unit(enemy, ability, target_unit)
	elif target_mode == Abilities.TargetMode.SELF:
		controller._cast_ability_on_unit(enemy, ability, enemy)

	enemy.pa -= cost
	var cd := int(ability.get("cooldown", 0))
	if cd > 0:
		enemy.set_cd(String(ability.get("name", "")), cd)

	var ability_name := String(ability.get("name", ""))
	if target_mode == Abilities.TargetMode.CELL:
		print("AI: chose ABILITY %s at %s score=%.1f" % [ability_name, target_cell, float(choice.score)])
	else:
		var tgt_name = target_unit.unit_name if target_unit != null else "self"
		print("AI: chose ABILITY %s on %s score=%.1f" % [ability_name, tgt_name, float(choice.score)])
	return true


func _do_move(controller: TacticalController, enemy: Unit, choice: Dictionary) -> bool:
	var cell: Vector2i = choice.cell
	if cell == enemy.cell:
		return false
	controller._try_move_with_overwatch_triggers(enemy, cell)
	print("AI: chose MOVE to %s score=%.1f" % [cell, float(choice.score)])
	return true


func _do_overwatch(controller: TacticalController, enemy: Unit, choice: Dictionary) -> bool:
	if not enemy.spend_pa(controller.SHOOT_COST):
		return false
	enemy.overwatch = true
	enemy.pa = 0
	print("AI: chose OVERWATCH score=%.1f" % [float(choice.score)])
	return true


func _best_shot(controller: TacticalController, enemy: Unit) -> Dictionary:
	if enemy.pa < controller.SHOOT_COST:
		return {}
	var best_score = -INF
	var best_target: Unit = null
	for p in controller.player_units:
		if p == null or p.dead:
			continue
		var prev = controller._compute_shot_preview(enemy, p)
		if prev == null or not prev.has_los or prev.dist > prev.max_range:
			continue
		var hit = float(prev.hit)
		var est_dmg = _estimate_weapon_damage(controller, enemy, p)
		var kill_bonus = 30.0 if est_dmg >= p.hp else 0.0
		var low_hp_bonus = (1.0 - float(p.hp) / float(p.max_hp)) * 20.0
		var role_bonus = _role_bonus(p)
		var cover = LOS.cover_vs_attacker(controller.grid, enemy.cell, p.cell)
		var no_cover_penalty = 10.0 if cover.type == "NONE" else 0.0
		var score = hit * 0.6 + kill_bonus + low_hp_bonus + role_bonus - no_cover_penalty
		if score > best_score:
			best_score = score
			best_target = p
	if best_target == null:
		return {}
	return {"type": "SHOOT", "score": best_score, "target": best_target}


func _best_melee(controller: TacticalController, enemy: Unit) -> Dictionary:
	if enemy.pa < controller.MELEE_COST:
		return {}
	var best_score = -INF
	var best_target: Unit = null
	for p in controller.player_units:
		if p == null or p.dead:
			continue
		if _manhattan(enemy.cell, p.cell) > 1:
			continue
		var est_dmg = _estimate_weapon_damage(controller, enemy, p)
		var kill_bonus = 40.0 if est_dmg >= p.hp else 0.0
		var low_hp_bonus = (1.0 - float(p.hp) / float(p.max_hp)) * 20.0
		var score = float(est_dmg) + kill_bonus + low_hp_bonus + 10.0
		if score > best_score:
			best_score = score
			best_target = p
	if best_target == null:
		return {}
	return {"type": "MELEE", "score": best_score, "target": best_target}


func _best_ability(controller: TacticalController, enemy: Unit) -> Dictionary:
	var best_score = -INF
	var best: Dictionary = {}
	for a in enemy.abilities:
		var ability_name := String(a.get("name", ""))
		var cost := int(a.get("cost_pa", 0))
		if enemy.pa < cost:
			continue
		if enemy.cd_left(ability_name) > 0:
			continue

		var target_mode := int(a.get("target_mode", Abilities.TargetMode.CELL))
		var tags: Array = a.get("tags", [])
		var ability_range := int(a.get("range", 0))

		if target_mode == Abilities.TargetMode.SELF:
			var self_score = _score_self_ability(enemy, a)
			if self_score > best_score:
				best_score = self_score
				best = {"type": "ABILITY", "score": self_score, "ability": a}
			continue

		if tags.has("MOVEMENT"):
			var move_score = _score_movement_ability(controller, enemy, a)
			if not move_score.is_empty() and move_score.score > best_score:
				best_score = move_score.score
				best = move_score
			continue

		if tags.has("HEAL"):
			var heal_score = _score_heal_ability(controller, enemy, a)
			if not heal_score.is_empty() and heal_score.score > best_score:
				best_score = heal_score.score
				best = heal_score
			continue

		if target_mode == Abilities.TargetMode.UNIT:
			for p in controller.player_units:
				if p == null or p.dead:
					continue
				if ability_range > 0 and _manhattan(enemy.cell, p.cell) > ability_range:
					continue
				var score = _score_damage_ability(controller, enemy, a, p)
				if score > best_score:
					best_score = score
					best = {"type": "ABILITY", "score": score, "ability": a, "target": p}
			continue

		if target_mode == Abilities.TargetMode.CELL:
			var cell_choice = _score_cell_ability(controller, enemy, a)
			if not cell_choice.is_empty() and cell_choice.score > best_score:
				best_score = cell_choice.score
				best = cell_choice

	return best


func _best_move(controller: TacticalController, enemy: Unit) -> Dictionary:
	var target = _best_shot(controller, enemy).get("target", null)
	if target == null:
		target = _nearest_player(controller, enemy.cell)
	if target == null:
		return {}

	var reachable = Pathfinding.reachable_with_pa(controller.grid, enemy.cell, enemy.pa, enemy)
	var best_score = -INF
	var best_cell: Vector2i = enemy.cell
	for cell in reachable.keys():
		if cell != enemy.cell and _cell_occupied(controller, cell):
			continue
		var score = _score_tile(controller, enemy, target, cell)
		var low_hp = float(enemy.hp) / float(enemy.max_hp) <= LOW_HP_RATIO
		if low_hp:
			var path = Pathfinding.find_path(controller.grid, enemy.cell, cell, enemy)
			if not path.is_empty() and controller._path_has_oa_risk(enemy, path):
				score -= 25.0
		if score > best_score:
			best_score = score
			best_cell = cell

	if best_cell == enemy.cell:
		return {}
	return {"type": "MOVE", "score": best_score, "cell": best_cell}


func _best_overwatch(controller: TacticalController, enemy: Unit) -> Dictionary:
	if enemy.pa < controller.SHOOT_COST:
		return {}
	var target = _nearest_player(controller, enemy.cell)
	if target == null:
		return {}

	var cover = LOS.cover_vs_attacker(controller.grid, enemy.cell, target.cell)
	var cover_score = 0.0
	if cover.type == "FULL":
		cover_score = 30.0
	elif cover.type == "HALF":
		cover_score = 15.0

	var prev = controller._compute_shot_preview(enemy, target)
	var los_score = 10.0 if prev != null and prev.has_los and prev.dist <= prev.max_range else 0.0
	var score = cover_score + los_score
	if score <= 0.0:
		return {}
	return {"type": "OVERWATCH", "score": score}


func _score_damage_ability(controller: TacticalController, _enemy: Unit, ability: Dictionary, target: Unit) -> float:
	var dmg := int(controller._ability_damage_amount(ability))
	var dmg_type := int(controller._ability_primary_damage_type(ability))
	var est = 0.0
	if dmg > 0:
		var ctx = controller._context_from_ability(ability)
		var range = controller._estimate_damage_range(dmg, _enemy, target, dmg_type, ctx)
		est = float(int(range.get("min", 0)) + int(range.get("max", 0))) * 0.5
	var finish = 25.0 if est >= target.hp else 0.0
	var low_hp_bonus = (1.0 - float(target.hp) / float(target.max_hp)) * 15.0
	var cc_bonus = _cc_bonus(ability)
	var status_bonus = _status_bonus(ability, target)
	return est + finish + low_hp_bonus + cc_bonus + status_bonus


func _score_cell_ability(controller: TacticalController, enemy: Unit, ability: Dictionary) -> Dictionary:
	var radius := int(ability.get("aoe_radius", 0))
	var ability_range := int(ability.get("range", 0))
	var dmg := int(ability.get("dmg", 0))
	if radius <= 0 or dmg <= 0:
		return {}
	var best_score = -INF
	var best_cell: Vector2i = enemy.cell
	for p in controller.player_units:
		if p == null or p.dead:
			continue
		if ability_range > 0 and _manhattan(enemy.cell, p.cell) > ability_range:
			continue
		var score = _score_aoe_at(controller, enemy, ability, p.cell)
		if score > best_score:
			best_score = score
			best_cell = p.cell
	if best_score <= 0:
		return {}
	return {"type": "ABILITY", "score": best_score, "ability": ability, "cell": best_cell}


func _score_aoe_at(controller: TacticalController, enemy: Unit, ability: Dictionary, center: Vector2i) -> float:
	var radius := int(ability.get("aoe_radius", 0))
	var dmg := int(ability.get("dmg", 0))
	var dmg_type := int(ability.get("dmg_type", 0))
	var total = 0.0
	var targets = 0
	for p in controller.player_units:
		if p == null or p.dead:
			continue
		var d = _manhattan(center, p.cell)
		if d > radius:
			continue
		var falloff = max(0.35, 1.0 - float(d) * 0.25)
		var raw = int(round(float(dmg) * falloff))
		var range = controller._estimate_damage_range(raw, enemy, p, dmg_type, {"tags": ["AOE"]})
		var eff = (float(range.get("min", 0)) + float(range.get("max", 0))) * 0.5
		total += float(eff)
		targets += 1
	if targets == 0:
		return 0.0
	var multi_bonus = float(targets - 1) * 15.0
	return total + multi_bonus + _cc_bonus(ability)


func _score_self_ability(enemy: Unit, ability: Dictionary) -> float:
	var tags: Array = ability.get("tags", [])
	if tags.has("HEAL"):
		var heal = int(ability.get("heal", 0))
		return float((enemy.max_hp - enemy.hp)) * 1.5 + float(heal)
	return 0.0


func _score_heal_ability(controller: TacticalController, enemy: Unit, ability: Dictionary) -> Dictionary:
	var ability_range := int(ability.get("range", 0))
	var heal := int(ability.get("heal", 0))
	if heal <= 0:
		return {}
	var best_score = -INF
	var best_target: Unit = null
	for ally in controller.enemy_units:
		if ally == null or ally.dead:
			continue
		if ability_range > 0 and _manhattan(enemy.cell, ally.cell) > ability_range:
			continue
		var missing = max(0, ally.max_hp - ally.hp)
		if missing <= 0:
			continue
		var score = float(missing) * 1.5 + float(heal)
		if score > best_score:
			best_score = score
			best_target = ally
	if best_target == null:
		return {}
	return {"type": "ABILITY", "score": best_score, "ability": ability, "target": best_target}


func _score_movement_ability(controller: TacticalController, enemy: Unit, ability: Dictionary) -> Dictionary:
	var move_range := int(ability.get("range", 0))
	if move_range <= 0:
		return {}
	var target = _nearest_player(controller, enemy.cell)
	if target == null:
		return {}
	var best_score = -INF
	var best_cell: Vector2i = enemy.cell
	for dx in range(-move_range, move_range + 1):
		for dy in range(-move_range, move_range + 1):
			if abs(dx) + abs(dy) > move_range:
				continue
			var cell = enemy.cell + Vector2i(dx, dy)
			if not controller.grid.in_bounds(cell.x, cell.y):
				continue
			if not controller.grid.is_walkable(cell.x, cell.y):
				continue
			if _cell_occupied(controller, cell):
				continue
			var score = _score_tile(controller, enemy, target, cell) + 5.0
			if score > best_score:
				best_score = score
				best_cell = cell
	if best_cell == enemy.cell:
		return {}
	return {"type": "ABILITY", "score": best_score, "ability": ability, "cell": best_cell}


func _score_tile(controller: TacticalController, enemy: Unit, target: Unit, cell: Vector2i) -> float:
	var score = 0.0
	var cover = LOS.cover_vs_attacker(controller.grid, cell, target.cell)
	if cover.type == "FULL":
		score += 40.0
	elif cover.type == "HALF":
		score += 15.0

	var pts = LOS.line(cell, target.cell)
	var blocker = controller._first_blocker_cell(pts)
	var has_los = (blocker == null)

	var low_hp = float(enemy.hp) / float(enemy.max_hp) <= LOW_HP_RATIO
	if low_hp:
		score += 10.0 if not has_los else -10.0
	else:
		score += 10.0 if has_los else -5.0

	var high = controller.grid.get_height(cell.x, cell.y) - controller.grid.get_height(target.cell.x, target.cell.y)
	if high > 0:
		score += float(high) * 5.0

	var dist = _manhattan(cell, target.cell)
	if low_hp and dist <= 1:
		score -= 20.0

	var ctx = {"melee": dist <= 1}
	var preview = controller._compute_shot_preview_from_cell(enemy, target, cell, ctx)
	if preview != null:
		if preview.get("backstab", false):
			score += 20.0
		elif String(preview.get("flank", "NONE")) == "FLANK":
			score += 10.0

	return score


func _estimate_weapon_damage(controller: TacticalController, attacker: Unit, defender: Unit) -> int:
	var raw = controller._get_base_attack_damage(attacker, false)
	var range = controller._estimate_damage_range(raw, attacker, defender, Damage.DmgType.PIERCING, {"tags": ["RANGED"]})
	return int(round((float(range.get("min", 0)) + float(range.get("max", 0))) * 0.5))


func _role_bonus(unit: Unit) -> float:
	if _has_role(unit, "healer"):
		return 20.0
	if _has_role(unit, "caster"):
		return 15.0
	return 0.0


func _has_role(unit: Unit, role_name: String) -> bool:
	if unit == null:
		return false
	if String(unit.role).to_lower() == role_name:
		return true
	return unit.tags.has(role_name)


func _cc_bonus(ability: Dictionary) -> float:
	var tags: Array = ability.get("tags", [])
	for cc in ["CC", "STUN", "ROOT", "SLOW", "SILENCE"]:
		if tags.has(cc):
			return 20.0
	return 0.0


func _status_bonus(ability: Dictionary, target: Unit) -> float:
	var tags: Array = ability.get("tags", [])
	var bonus = 0.0
	if tags.has("BLEED") and not target.has_status("BLEED"):
		bonus += 12.0
	if tags.has("BURN") and not target.has_status("BURN"):
		bonus += 12.0
	if tags.has("ROOT") and not target.has_status("ROOT"):
		bonus += 15.0
	if tags.has("VULNERABLE") and not target.has_status("VULNERABLE"):
		bonus += 18.0
	if tags.has("STUN") and not target.has_status("STUN"):
		bonus += 20.0
	return bonus


func _nearest_player(controller: TacticalController, cell: Vector2i) -> Unit:
	var best: Unit = null
	var best_d = INF
	for p in controller.player_units:
		if p == null or p.dead:
			continue
		var d = _manhattan(cell, p.cell)
		if d < best_d:
			best_d = d
			best = p
	return best


func _cell_occupied(controller: TacticalController, cell: Vector2i) -> bool:
	for u in controller.player_units:
		if u != null and not u.dead and u.cell == cell:
			return true
	for e in controller.enemy_units:
		if e != null and not e.dead and e.cell == cell:
			return true
	return false


func _manhattan(a: Vector2i, b: Vector2i) -> int:
	return abs(a.x - b.x) + abs(a.y - b.y)
