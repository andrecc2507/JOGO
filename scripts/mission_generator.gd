class_name CampaignMissionGenerator
extends Node

func build_seed(card: Dictionary) -> MissionSeed:
  return MissionSeed.new({
    "mission_id": card.get("mission_id", ""),
    "template_id": card.get("template_id", ""),
    "act_id": card.get("act_id", ""),
    "region_id": card.get("region_id", ""),
    "type": card.get("type", ""),
    "tags": card.get("tags", []),
    "risk": int(card.get("risk", 0)),
    "reward": card.get("reward", {}),
    "timer_days": int(card.get("timer_days", 1)),
    "enemy_pool_id": card.get("enemy_pool_id", ""),
    "boss_id": card.get("boss_id"),
    "objectives": card.get("objectives", []),
    "effects": card.get("effects", {}),
    "seed": int(card.get("seed", 0))
  })
