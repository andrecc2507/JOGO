class_name MissionBoard
extends Node

# Contratos do Mission Board (não simplificar):
# - 3–6 cards por dia (dependente do threat tier).
# - Cada card tem risco/recompensa/impacto DO vs IGNORE/timer/tags.
# - Geração 0–N por dia/semana baseada em pressão/threat com limite anti-spam.
# - Variedade: no máximo 2 missões do mesmo tipo.

var cards: Array = []
var rng := RandomNumberGenerator.new()
var last_mission_id: int = 0

func initialize(seed_data: Dictionary) -> void:
  rng.seed = int(seed_data.get("seed", 0))
  last_mission_id = int(seed_data.get("last_mission_id", 0))

func refresh(world_state: Node) -> void:
  var act: Dictionary = world_state.narrative_director.get_current_act()
  if act.is_empty():
    return
  var desired_count := _desired_card_count(world_state)
  cards.clear()
  var templates: Array = _select_templates(act, world_state, world_state.threat_tier, desired_count)
  var type_counts: Dictionary = {}
  for template in templates:
    var template_type := String(template.get("type", ""))
    type_counts[template_type] = int(type_counts.get(template_type, 0)) + 1
  for template in templates:
    var template_type := String(template.get("type", ""))
    if int(type_counts.get(template_type, 0)) > 2:
      continue
    cards.append(_build_card(template, world_state))
  while cards.size() < desired_count:
    if templates.is_empty():
      break
    var fallback: Dictionary = templates[rng.randi_range(0, templates.size() - 1)]
    cards.append(_build_card(fallback, world_state))

func tick_timers() -> void:
  for i in range(cards.size() - 1, -1, -1):
    cards[i]["timer_days"] -= 1
    if cards[i]["timer_days"] <= 0:
      cards.remove_at(i)

func tick_timers_and_collect_expired() -> Array:
  var expired := []
  for i in range(cards.size() - 1, -1, -1):
    cards[i][\"timer_days\"] -= 1
    if cards[i][\"timer_days\"] <= 0:
      expired.append(cards[i])
      cards.remove_at(i)
  return expired

func remove_card(mission_id: String) -> void:
  for i in range(cards.size() - 1, -1, -1):
    if cards[i]["mission_id"] == mission_id:
      cards.remove_at(i)
      return

func _desired_card_count(world_state: Node) -> int:
  var tier: int = world_state.threat_tier
  if tier <= 1:
    return rng.randi_range(3, 4)
  if tier == 2:
    return rng.randi_range(4, 5)
  return rng.randi_range(5, 6)

func _select_templates(act: Dictionary, world_state: Node, threat_tier: int, desired_count: int) -> Array:
  var pool_key := "threat_tier_%d" % clamp(threat_tier, 1, 3)
  var template_ids: Array = act.get("mission_pools", {}).get(pool_key, [])
  var available := []
  for template in world_state.mission_templates:
    if template_ids.has(template.get("id")):
      available.append(template)
  available.shuffle()
  return available.slice(0, min(desired_count, available.size()))

func _build_card(template: Dictionary, world_state: Node) -> Dictionary:
  last_mission_id += 1
  var region_id := _pick_region(template, world_state)
  var timer_range: Dictionary = template.get("timer_days", {"min": 1, "max": 1})
  var timer_days := rng.randi_range(int(timer_range.get("min", 1)), int(timer_range.get("max", 1)))
  return {
    "mission_id": "mission_%d" % last_mission_id,
    "template_id": template.get("id"),
    "act_id": template.get("act"),
    "region_id": region_id,
    "type": template.get("type"),
    "tags": template.get("tags", []),
    "risk": rng.randi_range(int(template.get("risk", {}).get("min", 0)), int(template.get("risk", {}).get("max", 0))),
    "reward": template.get("reward", {}),
    "timer_days": timer_days,
    "enemy_pool_id": _pick_enemy_pool(template),
    "boss_id": _pick_boss(template),
    "objectives": _simplify_objectives(template.get("objectives", [])),
    "effects": template.get("effects", {}),
    "do_summary": template.get("do_summary", ""),
    "ignore_summary": template.get("ignore_summary", ""),
    "seed": rng.randi()
  }

func _pick_region(template: Dictionary, world_state: Node) -> String:
  var allowed: Array = template.get("allowed_regions", [])
  if allowed.size() == 0:
    return world_state.regions.keys().pick_random()
  return allowed.pick_random()

func _pick_enemy_pool(template: Dictionary) -> String:
  var pools: Array = template.get("enemy_pools", [])
  if pools.size() == 0:
    return ""
  return pools.pick_random()

func _pick_boss(template: Dictionary) -> Variant:
  var bosses: Array = template.get("boss_pool", [])
  if bosses.size() == 0:
    return null
  return bosses.pick_random()

func _simplify_objectives(objectives: Array) -> Array:
  var simplified := []
  for obj in objectives:
    simplified.append({
      "id": obj.get("id"),
      "type": obj.get("type"),
      "description": obj.get("description")
    })
  return simplified
