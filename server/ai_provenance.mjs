// Machine-readable "this image is AI-generated" marking, so images keep saying
// what they are even after they leave Nexy (screenshots excepted). This follows
// the transparency duty for synthetic images in the EU AI Act (Art. 50(2)).
//
// Two mechanisms, in order of preference:
//   1. C2PA: OpenAI embeds a signed C2PA provenance manifest in the images it
//      returns. Any re-encode, and even adding a metadata chunk, breaks its
//      signature, so when a manifest is present the file is saved byte-for-byte.
//   2. IPTC Digital Source Type (XMP) + an EXIF description: written whenever
//      Nexy re-encodes an AI image anyway (thumbnails, the seed bundle) or the
//      image arrived without a C2PA manifest.
//
// Real, unedited photos (e.g. an upload whose AI edit was refused) are never marked.
import fs from 'fs';
import sharp from 'sharp';

// IPTC NewsCodes digital source types (https://cv.iptc.org/newscodes/digitalsourcetype/).
export const AI_GENERATED = 'trainedAlgorithmicMedia';
export const AI_COMPOSITE = 'compositeWithTrainedAlgorithmicMedia';

const DESCRIPTIONS = {
  [AI_GENERATED]: 'AI-generated image. Fictional content created in Nexy, a media literacy classroom simulator.',
  [AI_COMPOSITE]: 'Photo altered with generative AI in Nexy, a media literacy classroom simulator.',
};

function assertKnownType(digitalSourceType) {
  if (!DESCRIPTIONS[digitalSourceType]) {
    throw new Error(`Unknown digital source type: ${digitalSourceType}`);
  }
}

// XMP packets start with a byte-order mark inside begin="...".
const XMP_BOM = String.fromCharCode(0xfeff);

function buildXmp(digitalSourceType) {
  return `<?xpacket begin="${XMP_BOM}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/${digitalSourceType}"
    xmp:CreatorTool="Nexy">
   <dc:description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${DESCRIPTIONS[digitalSourceType]}</rdf:li>
    </rdf:Alt>
   </dc:description>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// Adds the XMP + EXIF marking to a sharp pipeline before it is written.
export function withAiProvenance(pipeline, digitalSourceType) {
  assertKnownType(digitalSourceType);
  return pipeline.withXmp(buildXmp(digitalSourceType)).withExif({
    IFD0: { ImageDescription: DESCRIPTIONS[digitalSourceType], Software: 'Nexy' },
  });
}

// C2PA manifests live in JUMBF boxes labelled "c2pa" (PNG caBX chunk, JPEG APP11).
export function hasC2paManifest(buffer) {
  return buffer.includes('c2pa', 0, 'latin1');
}

// Saves an image returned by the AI model: untouched if it carries a C2PA
// manifest, otherwise re-encoded losslessly as PNG with the XMP/EXIF marking.
export async function saveAiImage(buffer, outputPath, digitalSourceType) {
  assertKnownType(digitalSourceType);
  if (hasC2paManifest(buffer)) {
    fs.writeFileSync(outputPath, buffer);
    return;
  }
  await withAiProvenance(sharp(buffer).png(), digitalSourceType).toFile(outputPath);
}

// Marks an existing PNG file in place (used after image-js writes a resized copy,
// since image-js can't write metadata).
export async function markAiImageFile(filePath, digitalSourceType) {
  // Read into memory first so sharp holds no handle on the file it overwrites (Windows).
  const input = fs.readFileSync(filePath);
  const buffer = await withAiProvenance(sharp(input).png(), digitalSourceType).toBuffer();
  fs.writeFileSync(filePath, buffer);
}
