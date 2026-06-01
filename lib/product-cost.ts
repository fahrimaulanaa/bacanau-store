export type ProductCostLike = {
  name?: unknown;
  costPrice?: unknown;
};

function normalizeProductName(name: unknown) {
  return String(name || '').trim().toLowerCase();
}

export function getDefaultCostPrice(productName: unknown) {
  const name = normalizeProductName(productName);

  if (!name) return 0;
  if (name.includes('dubai chewy cookies')) return 15000;
  if (name.includes('cookies original')) return 7500;
  if (name.includes('cookies')) return 9500;
  if (name.includes('keychain') && name.includes('meme') && name.includes('kucing')) return 7200;
  if (name.includes('keychain') && name.includes('itb')) return 7000;
  if (name.includes('button') && name.includes('pin') && name.includes('snoopy')) return 3000;

  return 0;
}

export function resolveCostPrice(product: ProductCostLike) {
  const explicitCost = Number(product.costPrice);
  if (Number.isFinite(explicitCost) && explicitCost >= 0) {
    return explicitCost;
  }

  return getDefaultCostPrice(product.name);
}
