extends Node

# Diagnostics for DO/IGNORE flow.

func print_board_state() -> void:
	var world_state = _get_world_state()
	if world_state == null:
		push_error("Diagnostics: WorldState não encontrado.")
		return
	print("=== Mission Board State ===")
	print("Cards ativos: %d" % world_state.mission_board.cards.size())
	for card in world_state.mission_board.cards:
		print("- %s | template=%s | type=%s | region=%s | source_faction=%s" % [
			String(card.get("mission_id", "")),
			String(card.get("template_id", "")),
			String(card.get("mission_type", card.get("type", ""))),
			String(card.get("region_id", "")),
			String(card.get("source_faction_id", card.get("faction_id", "")))
		])
	print("===========================")

func test_do_ignore_flow() -> void:
	var world_state = _get_world_state()
	if world_state == null:
		push_error("Diagnostics: WorldState não encontrado.")
		return
	if world_state.mission_board.cards.is_empty():
		world_state.mission_board.refresh(world_state, true)
	if world_state.mission_board.cards.is_empty():
		push_error("Diagnostics: MissionBoard vazio, sem card para testar.")
		return
	var card := world_state.mission_board.cards[0].duplicate(true)
	var mission_id := String(card.get("mission_id", ""))
	print("Diagnostics: Testando IGNORE no card %s" % mission_id)
	var ignore_effects: Array = card.get("effects", {}).get("IGNORE", [])
	for effect in ignore_effects:
		world_state.apply_effect(effect, String(card.get("region_id", "")))
	var macro_ignore: Array = card.get("macro_effects_ignore", [])
	world_state.apply_macro_effects(macro_ignore, {
		"region_id": String(card.get("region_id", "")),
		"faction_id": String(card.get("source_faction_id", card.get("faction_id", "")))
	})
	world_state.mission_board.remove_card(mission_id)
	if _find_card(world_state, mission_id):
		push_error("Diagnostics: IGNORE falhou ao remover card %s" % mission_id)
	else:
		print("Diagnostics: IGNORE removeu card %s com sucesso." % mission_id)

	world_state.mission_board.refresh(world_state, true)
	if world_state.mission_board.cards.is_empty():
		push_error("Diagnostics: MissionBoard vazio após IGNORE.")
		return
	var card_do := world_state.mission_board.cards[0].duplicate(true)
	print("Diagnostics: Testando DO no card %s" % String(card_do.get("mission_id", "")))
	var seed = world_state.build_mission_seed(card_do)
	if seed == null:
		push_error("Diagnostics: DO falhou - MissionSeed nulo.")
		return
	if int(seed.seed) == 0:
		push_warning("Diagnostics: DO gerou seed 0, verifique randomização.")
	else:
		print("Diagnostics: MissionSeed gerado com seed %d" % int(seed.seed))

func _find_card(world_state: Node, mission_id: String) -> bool:
	for card in world_state.mission_board.cards:
		if String(card.get("mission_id", "")) == mission_id:
			return true
	return false

func _get_world_state() -> Node:
	var tree := get_tree()
	if tree == null:
		return null
	return tree.get_first_node_in_group("world_state")
