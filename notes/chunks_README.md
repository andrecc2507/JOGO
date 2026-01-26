# Sistema de Chunks (MVP)

## Como criar um chunk novo
1. Duplique `res://scene/chunks/examples/chunk_forest_open_a.tscn`.
2. Ajuste no inspector os exports do `ChunkRoot`:
   - `chunk_id`
   - `biome_tags` (ex: `["FOREST"]`)
   - `tags` (ex: `["OPEN"]`)
   - `chunk_size` (padrão: 10x10)
   - `edges` (`N/E/S/W`: `OPEN`, `WALL`, `ROAD`, `RIVER`)
3. Substitua o placeholder em `Visual` pelos seus modelos 3D.
4. Ajuste os markers em `Markers` (`SpawnA`, `SpawnB`, `ObjectiveA`).

## Como registrar no catálogo
Edite `res://content/chunks/chunk_catalog.json` e adicione:
```json
{
  "id": "forest_open_b",
  "scene": "res://scene/chunks/examples/chunk_forest_open_b.tscn",
  "biomes": ["FOREST"],
  "tags": ["OPEN"],
  "chunk_size": [10, 10],
  "edges": {"N": "OPEN", "E": "OPEN", "S": "OPEN", "W": "OPEN"},
  "weight": 1.0
}
```

## Convenção de edges
Valores esperados: `OPEN`, `WALL`, `ROAD`, `RIVER`.

## Tamanho padrão e cell_size
* `chunk_size` padrão: `10x10` células.
* `cell_size` usado no gerador: `1.0` (1 unidade = 1 célula).
