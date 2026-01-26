# Purge Candidates Report (v11)

## SAFE-TO-DELETE-LATER (moved)
- `res://scripts/tactical_bridge.gd`
  - Motivo: duplicado não-autoload; o fluxo usa `res://scripts/integration/tactical_bridge.gd`.
  - Referências encontradas: nenhuma (busca por texto no repo).
- `res://scripts/tactical_bridge.gd.uid`
  - Motivo: metadata do script duplicado movido acima.

## KEEP (used)
- `res://scripts/integration/tactical_bridge.gd` (autoload ativo em `project.godot`).
- `res://scene/ui/after_action_report.tscn` + `res://scripts/ui/after_action_report.gd` (referenciado em `TacticalBridge`, mesmo que não usado no fluxo principal).

## Observações
- Não foram deletados arquivos; apenas movidos para `_deprecated/_purge_candidates/`.
