# Sources and how much to trust them

This is an independent portfolio project, not affiliated with JHU APL or the BossDB team. It was built with help from an LLM (Claude), so claims are sorted by how they were established. When you find a mistake, please fix the entry and move it to the right tier.

## 1. Checked against the live API or official docs

- Cutout formats and the JPEG layout (z-slices stacked vertically, uint8 image channels only): [cutout-get reference](https://docs.theboss.io/reference/cutout-get), pasted from the docs and confirmed by the 500 errors described in the README.
- Metadata endpoints (`collection/`, `experiment/`, `channel/`, `coord/`) and the public token: [API reference](https://docs.theboss.io/reference), and working responses seen in the browser.
- A bare Blosc buffer for `application/blosc`: decoded a real response for `apl-team/humans/boss` (`0:4/0:4/0:4/0:1`) in `lib/blosc.spec.ts`, and compared it with the JPEG for the same voxels in the app's debug panel.

## 2. Taken from a page that was fetched

Read through a summarising fetch, not line by line. The papers disagree with each other on label numbering, so treat label names as unconfirmed until checked against a channel's data.

- Brain-region labels in the original dataset paper ([Prasad et al. 2020, Scientific Data](https://pmc.ncbi.nlm.nih.gov/articles/PMC7576781)): 0 no label, 1 cortex, 2 striatum, 3 TRN, 4 VP, 5 ZI, 6 internal capsule, 7 hypothalamus, 8 corpus callosum. Annotated by hand on 8 slices only (z = 109, 159, ..., 459). BossDB channels named there: `images`, `region_of_interest`, `pixel_annotation`.
- Microstructure labels (both papers agree): 0 no label (background), 1 vasculature, 2 cell body, 3 myelinated axon. Hand-drawn on four 257x257x361 sub-volumes in the dataset paper; the [MTNeuro paper](https://arxiv.org/pdf/2301.00345) describes a U-Net plus proofreading across the volume.
- MTNeuro's benchmark numbering for its ROI task is different (CTX 0, STR 1, VP 2, ZI 3), and its channels are `prasad/prasad2020/image`, `prasad/prasad_analysis/roi_labels` and `prasad/prasad_analysis/pixel_labels`. It does not say whether the stored values match.
- Observed on `prasad` data in the app: ids 2, 3, 4 and 6 appeared on a region-label channel, which fits the dataset paper's numbering (not MTNeuro's 0-3). This is one observation by the project owner, not a full check.
- The bioRxiv paper 2020.10.07.329789 (multi-scale MRI, X-ray and EM of one mouse brain) does not define any label ids and does not mention BossDB.
- Neuroglancer's Boss data source (`src/datasource/boss/frontend.ts`): `boss://` + API host + `collection/experiment/channel`; image vs segmentation from the channel `type`; JPEG for uint8, npz otherwise; calls a `downsample` endpoint for per-level sizes.

## 3. Found but not read

- [BossDB tools paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12560848/) and [BossDB paper](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8885591/). Listed in search results only.

## 4. Recalled by the model, unchecked

- Background on the data model: cuboid sizes, Morton (Z-order) indexing, the resolution hierarchy, and dtype conventions (images uint8/uint16, annotations uint64). Treat as leads to verify against the papers above.
- Metadata field names (`coord_frame`, `num_hierarchy_levels`, `x_voxel_size`, ...) came from the intern client library as recalled. They work in practice, but are not confirmed against a spec.
- Full forms for TRN (thalamic reticular nucleus) and VP (ventral posterior thalamus) in `lib/label-names.ts` are standard neuroanatomy, not quoted from the papers.
- The shape of the `downsample` response (`extent` keyed by level) comes from reading Neuroglancer's source, not from a live response; `lib/levels.ts` falls back to an estimate if it does not match.
- Which channels count as "image" or "annotation" in `lib/capabilities.ts`: derived from `type` and `datatype`, not from a documented list of supported formats.

## Data credit

All data is served by [BossDB](https://bossdb.org) from its public holdings. Each dataset has its own authors, citation and licence on its BossDB page. Check these before sharing screenshots or links, and cite the dataset's authors when you show it.
