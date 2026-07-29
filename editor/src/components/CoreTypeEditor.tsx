import type { CoreType } from "../model/project";
import {
  CORE_TYPE_PRESETS,
  coreTypeKey,
  formatCoreType,
  normalizeCoreType,
} from "../model/coreTypes";

type TypeKind = "unit" | "bool" | "nat" | "function";

function typeKind(type: CoreType): TypeKind {
  if (type === "unit" || type === "bool" || type === "nat") return type;
  return "function";
}

function defaultTypeForKind(kind: TypeKind): CoreType {
  if (kind === "unit" || kind === "bool" || kind === "nat") return kind;
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
  const isArrow = typeof normalized !== "string";
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
      <code className="core-type-summary">{formatCoreType(normalized)}</code>
    </fieldset>
  );
}
