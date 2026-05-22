/**
 * Build public URL for uploaded education assets.
 */
function buildEducationAssetUrl(req, folder, filename) {
  const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(
    /\/$/,
    ''
  );
  return `${baseUrl}/uploads/${folder}/${filename}`;
}

function serializeProofDocument(proof) {
  if (!proof?.url) return null;
  return {
    filename: proof.filename,
    url: proof.url,
    mimeType: proof.mimeType || null,
    uploadedAt: proof.uploadedAt,
  };
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Group awards by entity for student profile / detail views.
 */
function groupAwardsByEntity(awards) {
  const map = new Map();

  for (const row of awards) {
    const entity = row.entity;
    const cert = row.certificate;
    if (!entity || !cert) continue;

    const entityId = entity._id?.toString() || String(entity);
    if (!map.has(entityId)) {
      map.set(entityId, {
        entity: {
          _id: entity._id,
          name: entity.name,
          slug: entity.slug,
          logoUrl: entity.logoUrl,
          description: entity.description,
          website: entity.website,
        },
        certificates: [],
      });
    }

    map.get(entityId).certificates.push({
      _id: cert._id,
      awardId: row._id,
      title: cert.title,
      track: cert.track,
      imageUrl: cert.imageUrl,
      description: cert.description,
      category: cert.category
        ? { _id: cert.category._id, name: cert.category.name }
        : null,
      awardedAt: row.awardedAt,
      source: row.source,
      proofDocument: serializeProofDocument(row.proofDocument),
      hasProof: !!(row.proofDocument && row.proofDocument.url),
    });
  }

  const entities = Array.from(map.values());
  for (const e of entities) {
    e.certificates.sort((a, b) => new Date(b.awardedAt) - new Date(a.awardedAt));
  }

  return entities;
}

/** Client-facing awards: no proof documents or internal flags. */
function groupAwardsByEntityForClient(awards) {
  return groupAwardsByEntity(awards).map((row) => ({
    entity: row.entity,
    certificates: row.certificates.map(
      ({ proofDocument, hasProof, source, awardId, ...rest }) => rest
    ),
  }));
}

module.exports = {
  buildEducationAssetUrl,
  slugify,
  serializeProofDocument,
  groupAwardsByEntity,
  groupAwardsByEntityForClient,
};
