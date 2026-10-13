import type { CSSProperties } from 'react';
import type { Product } from '../domain/types';

const MAX_COLUMNS = 3;

export function ProductTabs({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
}) {
  // 3つまでは横一列に等幅で並べ、4つ目からは次の段に折り返す
  const columns = Math.min(Math.max(products.length, 1), MAX_COLUMNS);

  return (
    <div className="product-tabs" role="tablist" aria-label="体験" style={{ '--columns': columns } as CSSProperties}>
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={p.id === value}
          className="product-tab"
          style={{ '--product': p.color } as CSSProperties}
          onClick={() => onChange(p.id)}
        >
          <span className="product-tab__swatch" />
          <span className="product-tab__name">{p.name}</span>
        </button>
      ))}
    </div>
  );
}
