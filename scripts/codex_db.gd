class_name CodexDb
extends Node

var entries: Array = []

func load_from_content(content: Dictionary) -> void:
  entries = content.get("codex_entries", {}).get("entries", [])

func get_entry(entry_id: String) -> Dictionary:
  for entry in entries:
    if entry.get("id", "") == entry_id:
      return entry
  return {}

func filter_by_tag(tag: String) -> Array:
  var filtered := []
  for entry in entries:
    if entry.get("tags", []).has(tag):
      filtered.append(entry)
  return filtered
