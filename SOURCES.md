# Sources and how much to trust them

This is an independent portfolio project, not affiliated with JHU APL or the BossDB team. It was built with help from an LLM (Claude), so claims are sorted by how they were established. When you find a mistake, please fix the entry and move it to the right tier.

## 1. Checked against the live API or official docs

- Cutout formats and the JPEG layout (z-slices stacked vertically, uint8 image channels only): [cutout-get reference](https://docs.theboss.io/reference/cutout-get), pasted from the docs and confirmed by the 500 errors described in the README.
- Metadata endpoints (`collection/`, `experiment/`, `channel/`, `coord/`) and the public token: [API reference](https://docs.theboss.io/reference), and working responses seen in the browser.
- A bare Blosc buffer for `application/blosc`: decoded a real response for `apl-team/humans/boss` (`0:4/0:4/0:4/0:1`) in `lib/blosc.spec.ts`, and compared it with the JPEG for the same voxels in the app's debug panel.

## 2. Taken from a page that was fetched

- The prasad dataset channels and label values used in the overlay plans (`prasad/prasad2020/image`, `prasad/prasad_analysis/roi_labels`, `prasad/prasad_analysis/pixel_labels`; regions CTX, STR, VP, ZI; pixel labels vessels, cells, myelinated axons): [MTNeuro paper](https://arxiv.org/pdf/2301.00345). The page was read through a summarising fetch, not line by line. Confirm in the app before relying on it.

## 3. Found but not read

- [BossDB tools paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12560848/) and [BossDB paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8885591/). Listed in search results only.

## 4. Recalled by the model, unchecked

- Background on the data model: cuboid sizes, Morton (Z-order) indexing, the resolution hierarchy, and dtype conventions (images uint8/uint16, annotations uint64). Treat as leads to verify against the papers above.
- Metadata field names (`coord_frame`, `num_hierarchy_levels`, `x_voxel_size`, ...) came from the intern client library as recalled. They work in practice, but are not confirmed against a spec.
- Which channels count as "image" or "annotation" in `lib/capabilities.ts`: derived from `type` and `datatype`, not from a documented list of supported formats.

## Data credit

All data is served by [BossDB](https://bossdb.org) from its public holdings. Each dataset has its own authors, citation and licence on its BossDB page. Check these before sharing screenshots or links, and cite the dataset's authors when you show it.
