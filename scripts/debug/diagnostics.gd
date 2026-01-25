class_name Diagnostics
extends Node

static func print_mission_debug(world_state: Node) -> void:
	if world_state == null:
		push_warning("Diagnostics: world_state inválido")
		return
	var act: Dictionary = world_state.get_current_act() if world_state.has_method("get_current_act") else {}
	var tier := clampi(int(world_state.get("threat_tier", 1)), 1, 3)
	var tier_key := "threat_tier_%d" % tier
	var pool_ids: Array = act.get("mission_pools", {}).get(tier_key, [])
	var templates: Array = world_state.get("mission_templates", [])
	var selected := []
	for template in templates:
		if pool_ids.has(template.get("id")):
			selected.append(template)
	var mission_board = world_state.get("mission_board")
	var cooldown_hours := mission_board.spawn_cooldown_hours if mission_board != null else 0.0
	var active_cards := mission_board.cards.size() if mission_board != null else 0
	var last_spawn_day := mission_board.last_spawn_day if mission_board != null else 0
	var max_cards := MissionBoard.MAX_ACTIVE_CARDS if mission_board != null else 0
	var min_cards := MissionBoard.MIN_ACTIVE_CARDS if mission_board != null else 0
	print("Diagnostics: act=%s tier=%s pool_ids=%d templates=%d selected=%d cooldown_h=%.2f active_cards=%d last_spawn_day=%d min/max=%d/%d" % [
		String(act.get("id", "")),
		tier_key,
		pool_ids.size(),
		templates.size(),
		selected.size(),
		cooldown_hours,
		active_cards,
		last_spawn_day,
		min_cards,
		max_cards
	])
