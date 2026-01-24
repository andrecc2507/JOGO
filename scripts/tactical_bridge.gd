class_name TacticalBridge
extends Node

# Stub: conecta o geoscape ao tático sem acoplar lógicas.
# Contrato:
# - Geoscape envia MissionSeed (layout seed, inimigos, objetivos, tags).
# - Cena tática devolve MissionResult (success/fail, casualties, loot, relation,
#   flags, objetivos secundários, boss morto).

var mission_generator := MissionGenerator.new()

func start_mission(card: Dictionary) -> MissionSeed:
  return mission_generator.build_seed(card)

func finish_mission(world_state: WorldState, result: MissionResult) -> void:
  world_state.apply_mission_result(result)
