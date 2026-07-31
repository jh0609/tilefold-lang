import type { CoreType } from "../model/project";
import {
  CORE_TYPE_PRESETS,
  coreTypeKey,
  formatCoreType,
  normalizeCoreType,
} from "../model/coreTypes";

type TypeKind = "unit" | "bool" | "nat" | "product" | "sum" | "list" | "function";

function typeKind(type: CoreType): TypeKind {
  if (type === "unit" || type === "bool" || type === "nat") return type;
  if ("product" in type) return "product";
  if ("sum" in type) return "sum";
  if ("list" in type) return "list";
  return "function";
}

function defaultTypeForKind(kind: TypeKind): CoreType {
  if (kind === "unit" || kind === "bool" || kind === "nat") return kind;
  if (kind === "product") return { product: ["nat", "bool"] };
  if (kind === "sum") return { sum: ["nat", "bool"] };
  if (kind === "list") return { list: "nat" };
  return { arrow: ["nat", "nat"] };
}

export function CoreTypeEditor({
  label,
  value,
  disabled = false,
  onChange,
  level = 0,
  showPresets = level === 0,
}: {
  label: string;
  value: CoreType;
  disabled?: boolean;
  onChange: (type: CoreType) => void;
  level?: number;
  showPresets?: boolean;
}) {
  const normalized = normalizeCoreType(value);
  const isArrow = typeof normalized !== "string" && "arrow" in normalized;
  const isProduct = typeof normalized !== "string" && "product" in normalized;
  const isSum = typeof normalized !== "string" && "sum" in normalized;
  const isList = typeof normalized !== "string" && "list" in normalized;
  return (
    <fieldset
      className={`core-type-editor depth-${Math.min(level, 4)}`}
      disabled={disabled}
    >
      <legend>{label}</legend>
      <label>
        <span>Kind</span>
        <select
          aria-label={label}
          value={typeKind(normalized)}
          onChange={(event) =>
            onChange(defaultTypeForKind(event.target.value as TypeKind))
          }
        >
          <option value="unit">Unit</option>
          <option value="bool">Bool</option>
          <option value="nat">Nat</option>
          <option value="product">Product</option>
          <option value="sum">Sum</option>
          <option value="list">List</option>
          <option value="function">Function</option>
        </select>
      </label>
      {showPresets && (
        <div className="core-type-presets" aria-label="Core type presets">
          {CORE_TYPE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled || coreTypeKey(preset.value) === coreTypeKey(normalized)}
              onClick={() => onChange(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {isArrow && (
        <div className="core-type-children">
          <CoreTypeEditor
            label={`${label} input`}
            value={normalized.arrow[0]}
            disabled={disabled}
            onChange={(input) =>
              onChange({ arrow: [input, normalized.arrow[1]] })
            }
            level={level + 1}
            showPresets={false}
          />
          <CoreTypeEditor
            label={`${label} output`}
            value={normalized.arrow[1]}
            disabled={disabled}
            onChange={(output) =>
              onChange({ arrow: [normalized.arrow[0], output] })
            }
            level={level + 1}
            showPresets={false}
          />
        </div>
      )}
      {isProduct && (
        <div className="core-type-children">
          <CoreTypeEditor
            label={`${label} left`}
            value={normalized.product[0]}
            disabled={disabled}
            onChange={(left) =>
              onChange({ product: [left, normalized.product[1]] })
            }
            level={level + 1}
            showPresets={false}
          />
          <CoreTypeEditor
            label={`${label} right`}
            value={normalized.product[1]}
            disabled={disabled}
            onChange={(right) =>
              onChange({ product: [normalized.product[0], right] })
            }
            level={level + 1}
            showPresets={false}
          />
        </div>
      )}
      {isSum && (
        <div className="core-type-children">
          <CoreTypeEditor
            label={`${label} left alternative`}
            value={normalized.sum[0]}
            disabled={disabled}
            onChange={(left) => onChange({ sum: [left, normalized.sum[1]] })}
            level={level + 1}
            showPresets={false}
          />
          <CoreTypeEditor
            label={`${label} right alternative`}
            value={normalized.sum[1]}
            disabled={disabled}
            onChange={(right) => onChange({ sum: [normalized.sum[0], right] })}
            level={level + 1}
            showPresets={false}
          />
        </div>
      )}
      {isList && (
        <div className="core-type-children">
          <CoreTypeEditor
            label={`${label} item`}
            value={normalized.list}
            disabled={disabled}
            onChange={(item) => onChange({ list: item })}
            level={level + 1}
            showPresets={false}
          />
        </div>
      )}
      <code className="core-type-summary">{formatCoreType(normalized)}</code>
    </fieldset>
  );
}
