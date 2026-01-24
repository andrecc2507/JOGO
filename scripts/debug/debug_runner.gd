class_name DebugRunner
extends Node

func simulate() -> void:
  var world_state := get_tree().get_first_node_in_group("world_state")
  if world_state == null:
    push_error("DebugRunner: WorldState not found")
    return
  for day_index in range(14):
    world_state.advance_day()
    var act: Dictionary = world_state.campaign_director.get_current_act()
    var act_name: String = String(act.get("name", ""))
    print("Dia %d | Ato: %s | Threat: %d" % [world_state.day, act_name, world_state.threat_tier])
    for region_id in world_state.regions.keys():
      var region: Dictionary = world_state.regions[region_id]
      print(" - %s: rifts=%d pressure=%d stability=%d" % [
        region_id,
        int(region.get("rifts", 0)),
        int(region.get("pressure", 0)),
        int(region.get("stability", 0))
      ])
    print("Cards ativos: %d" % world_state.mission_board.cards.size())
    for card in world_state.mission_board.cards:
      print(" * %s (%s) timer=%d" % [card.get("mission_id"), card.get("type"), card.get("timer_days")])
  _apply_fake_results(world_state)

func _apply_fake_results(world_state: Node) -> void:
  if world_state.mission_board.cards.size() < 2:
    return
  var first_card: Dictionary = world_state.mission_board.cards[0]
  var second_card: Dictionary = world_state.mission_board.cards[1]
  var success_result := MissionResult.new({
    "mission_id": first_card.get("mission_id"),
    "success": true,
    "time_spent_days": 2,
    "casualties": 1,
    "wounds": 2,
    "loot": {"gold": 120, "items": ["reliquia"]},
    "relation_changes": {"conselho": 2},
    "flags_gained": ["rift_charted"],
    "flags_lost": [],
    "objectives_completed": ["obj_rift_scan"],
    "boss_defeated": false,
    "notes": "Simulação de sucesso."
  })
  var fail_result := MissionResult.new({
    "mission_id": second_card.get("mission_id"),
    "success": false,
    "time_spent_days": 1,
    "casualties": 3,
    "wounds": 4,
    "loot": {"gold": 0, "items": []},
    "relation_changes": {"coroa": -1},
    "flags_gained": [],
    "flags_lost": [],
    "objectives_completed": [],
    "boss_defeated": false,
    "notes": "Simulação de falha."
  })
  world_state.apply_mission_result(success_result)
  world_state.apply_mission_result(fail_result)
