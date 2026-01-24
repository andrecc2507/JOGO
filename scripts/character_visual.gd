extends Node3D
class_name CharacterVisual

# COMO USAR:
# 1) Anexe este script ao nó visual do personagem.
# 2) Chame apply_cosmetics(cosmetics) quando editar no Dojo.
# 3) Implemente o corpo quando modelos estiverem prontos.

func apply_cosmetics(cosmetics: Dictionary) -> void:
	# Placeholder: será usado para aplicar materiais/modelos.
	set_meta("cosmetics", cosmetics)

func _ready() -> void:
	add_to_group("character_visual")
