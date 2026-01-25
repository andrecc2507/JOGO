class_name Diagnostics
extends Node

static func print_mission_debug(world_state: Node) -> void:
	if world_state == null:
		push_warning("Diagnostics: world_state inválido")
		return
		
	var act: Dictionary = world_state.get_current_act() if world_state.has_method("get_current_act") else {}
	
	# --- CORREÇÃO LINHA 9 (Get sem valor padrão) ---
	var raw_tier = world_state.get("threat_tier")
	if raw_tier == null:
		raw_tier = 1
	var tier := clampi(int(raw_tier), 1, 3)
	# -----------------------------------------------
	
	var tier_key := "threat_tier_%d" % tier
	var pool_ids: Array = act.get("mission_pools", {}).get(tier_key, [])
	
	# --- CORREÇÃO LINHA 12 (Get sem valor padrão) ---
	var raw_templates = world_state.get("mission_templates")
	var templates: Array = raw_templates if raw_templates != null else []
	# -----------------------------------------------
	
	var selected := []
	for template in templates:
		if pool_ids.has(template.get("id")):
			selected.append(template)
			
	var mission_board = world_state.get("mission_board")
	
	# --- CORREÇÃO LINHAS 18, 19, 20 (Definição explícita de tipos) ---
	# Trocamos := por : float = (ou int), pois o Godot não consegue adivinhar
	# o tipo vindo de uma variável dinâmica.
	var cooldown_hours: float = mission_board.spawn_cooldown_hours if mission_board != null else 0.0
	var active_cards: int = mission_board.cards.size() if mission_board != null else 0
	var last_spawn_day: int = mission_board.last_spawn_day if mission_board != null else 0
	# -----------------------------------------------------------------
	
	# Nota: Se você removeu o class_name MissionBoard para corrigir o erro de Autoload,
	# as linhas abaixo (MissionBoard.MAX...) podem dar erro.
	# Se derem erro, troque MissionBoard por mission_board (minúsculo) ou pelo nome do seu Autoload (ex: MissionManager).
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
