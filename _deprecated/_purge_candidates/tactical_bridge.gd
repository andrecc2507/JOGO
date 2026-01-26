extends Node

# COMO USAR:
# 1) Use este bridge legado para encaminhar para o TacticalBridge oficial.
# 2) Chame start_mission(card) para obter MissionSeed.
# 3) Chame finish_mission(world_state, result) para aplicar resultados.

var mission_generator := MissionGenerator.new()

func start_mission(card: Dictionary) -> MissionSeed:
	var world_state = get_tree().get_first_node_in_group("world_state")
	var party_ids: Array = []
	var consumables: Array = []
	if world_state != null and world_state.has_method("build_mission_seed"):
		return world_state.build_mission_seed(card)
	return mission_generator.build_seed(card, party_ids, consumables)

func finish_mission(world_state: WorldState, result: MissionResult) -> void:
	if world_state == null:
		return
	world_state.apply_mission_result(result)
