import { useEffect, useRef, useState } from "react";
import type {
  Bounds,
  CoreType,
  ProjectDocument,
  ProjectElement,
  Selection,
  SurfaceFunctionMetadata,
} from "../model/project";
import {
  templateFunctionReferences,
  templateCaptureDrafts,
  validProjectId,
  type SurfaceFunctionSignatureEdit,
  type TemplateCapturesEdit,
} from "../model/editorOps";
import { wireEndpointAvailability } from "../model/portConnections";
import { formatCoreType } from "../model/coreTypes";
import {
  standardLibraryFunction,
  type StandardLibraryFunction,
} from "../model/standardLibrary";
import { CoreTypeEditor } from "./CoreTypeEditor";

interface InspectorProps {
  document: ProjectDocument;
  selection: Selection | null;
  error: string | null;
  onBoundsChange: (id: string, bounds: Bounds) => void;
  onNatValueChange: (id: string, value: string) => void;
  onBoolValueChange: (id: string, value: boolean) => void;
  onElementTypeChange: (id: string, type: CoreType) => void;
  onApplyTypesChange: (
    id: string,
    parameterType: CoreType,
    resultType: CoreType,
  ) => void;
  onPairTypesChange: (
    id: string,
    leftType: CoreType,
    rightType: CoreType,
  ) => void;
  onSumTypesChange: (
    id: string,
    leftType: CoreType,
    rightType: CoreType,
  ) => void;
  onCaseTypesChange: (
    id: string,
    leftType: CoreType,
    rightType: CoreType,
    resultType: CoreType,
  ) => void;
  onListItemTypeChange: (id: string, itemType: CoreType) => void;
  onListRecTypesChange: (
    id: string,
    itemType: CoreType,
    resultType: CoreType,
  ) => void;
  onEntryResultTypeChange: (containerId: string, resultType: CoreType) => void;
  canDelete: boolean;
  onDelete: () => void;
  onFocusTemplate: (templateId: string) => void;
  onOpenStandardLibraryDefinition: (definition: StandardLibraryFunction) => void;
  onFocusEntry: () => void;
  callerReturn:
    | { containerId: string; label: string; onReturn: () => void }
    | null;
  standardLibraryDefinition: StandardLibraryFunction | null;
  onBackFromStandardLibraryDefinition: () => void;
  onEditSignature: (edit: SurfaceFunctionSignatureEdit) => boolean;
  onEditCaptures: (edit: TemplateCapturesEdit) => boolean;
  onFitContainer: (id: string) => void;
  onFitViewToContainer: (id: string) => void;
  onAutoLayoutContainer: (id: string) => void;
  onError: (error: string | null) => void;
}

interface SignatureParameterRow {
  draftId: number;
  originalName?: string;
  name: string;
  type: CoreType;
}

interface CaptureRow {
  draftId: number;
  originalKey?: string;
  key: string;
  type: CoreType;
}

function signatureValidation(
  document: ProjectDocument,
  surfaceFunction: SurfaceFunctionMetadata,
  name: string,
  parameters: readonly SignatureParameterRow[],
  resultName: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!validProjectId(name)) {
    errors.name =
      name.trim().length === 0
        ? "Function name is required"
        : "Function name must use ASCII letters, digits, underscores, hyphens, or periods.";
  } else if (
    document.surfaceFunctions?.some(
      (candidate) =>
        candidate.templateId !== surfaceFunction.templateId &&
        candidate.name === name,
    )
  ) {
    errors.name = `A function named "${name}" already exists`;
  }
  if (!validProjectId(resultName)) {
    errors.resultName =
      resultName.trim().length === 0
        ? "Result name is required"
        : "Result name must use ASCII letters, digits, underscores, hyphens, or periods.";
  }
  if (parameters.length === 0) {
    errors.parameters = "At least one argument is required";
  }
  const seen = new Set<string>();
  parameters.forEach((parameter, index) => {
    if (!validProjectId(parameter.name)) {
      errors[`parameter-${parameter.draftId}`] =
        parameter.name.trim().length === 0
          ? "Argument name is required"
          : "Argument name must use ASCII letters, digits, underscores, hyphens, or periods.";
    }
    if (seen.has(parameter.name)) {
      errors.parameters = "Argument names must be unique";
      errors[`parameter-${parameter.draftId}`] =
        "Argument names must be unique";
    }
    seen.add(parameter.name);
  });
  return errors;
}

function SignatureEditDialog({
  document,
  surfaceFunction,
  onApply,
  onCancel,
}: {
  document: ProjectDocument;
  surfaceFunction: SurfaceFunctionMetadata;
  onApply: (edit: SurfaceFunctionSignatureEdit) => boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(surfaceFunction.name);
  const [parameters, setParameters] = useState<SignatureParameterRow[]>(() =>
    surfaceFunction.parameters.map((parameter, index) => ({
      draftId: index + 1,
      originalName: parameter.name,
      name: parameter.name,
      type: parameter.type,
    })),
  );
  const [resultName, setResultName] = useState(surfaceFunction.result.name);
  const [resultType, setResultType] = useState<CoreType>(
    surfaceFunction.result.type,
  );
  const nextDraftId = useRef(surfaceFunction.parameters.length + 1);
  const errors = signatureValidation(
    document,
    surfaceFunction,
    name,
    parameters,
    resultName,
  );
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function updateParameter(
    draftId: number,
    patch: Partial<SignatureParameterRow>,
  ) {
    setParameters((current) =>
      current.map((parameter) =>
        parameter.draftId === draftId ? { ...parameter, ...patch } : parameter,
      ),
    );
  }

  function moveParameter(index: number, delta: -1 | 1) {
    setParameters((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <div
      className="signature-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className="signature-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (hasErrors) return;
          if (
            onApply({
              templateId: surfaceFunction.templateId,
              name,
              parameters: parameters.map(
                ({ originalName, name: parameterName, type }) => ({
                  originalName,
                  name: parameterName,
                  type,
                }),
              ),
              resultName,
              resultType,
            })
          ) {
            onCancel();
          }
        }}
      >
        <div className="function-authoring-heading">
          <strong id="signature-dialog-title">Edit signature</strong>
          <button
            type="button"
            aria-label="Cancel signature edit"
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        <label>
          Function name
          <input
            autoFocus
            value={name}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "signature-name-error" : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {errors.name && (
          <p id="signature-name-error" className="inline-error">
            {errors.name}
          </p>
        )}
        <section className="function-captures">
          <div className="function-captures-heading">
            <strong>Arguments</strong>
            <button
              type="button"
              onClick={() =>
                setParameters((current) => [
                  ...current,
                  {
                    draftId: nextDraftId.current++,
                    name: `arg_${current.length + 1}`,
                    type: "nat",
                  },
                ])
              }
            >
              Add parameter
            </button>
          </div>
          {parameters.map((parameter, index) => (
            <div className="function-capture-row" key={parameter.draftId}>
              <label>
                <span className="visually-hidden">
                  Parameter {index + 1} name
                </span>
                <input
                  aria-label={`Parameter ${index + 1} name`}
                  value={parameter.name}
                  aria-invalid={Boolean(errors[`parameter-${parameter.draftId}`])}
                  onChange={(event) =>
                    updateParameter(parameter.draftId, {
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <CoreTypeEditor
                label={`Parameter ${index + 1} type`}
                value={parameter.type}
                onChange={(type) =>
                  updateParameter(parameter.draftId, { type })
                }
              />
              <button
                type="button"
                aria-label={`Move parameter ${index + 1} up`}
                disabled={index === 0}
                onClick={() => moveParameter(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move parameter ${index + 1} down`}
                disabled={index === parameters.length - 1}
                onClick={() => moveParameter(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove parameter ${index + 1}`}
                disabled={parameters.length === 1}
                onClick={() =>
                  setParameters((current) =>
                    current.filter(
                      (candidate) => candidate.draftId !== parameter.draftId,
                    ),
                  )
                }
              >
                ×
              </button>
              {errors[`parameter-${parameter.draftId}`] && (
                <p className="inline-error">
                  {errors[`parameter-${parameter.draftId}`]}
                </p>
              )}
            </div>
          ))}
          {errors.parameters && (
            <p className="inline-error">{errors.parameters}</p>
          )}
        </section>
        <div className="function-type-fields">
          <label>
            Result name
            <input
              value={resultName}
              aria-invalid={Boolean(errors.resultName)}
              onChange={(event) => setResultName(event.target.value)}
            />
          </label>
          <CoreTypeEditor
            label="Result type"
            value={resultType}
            onChange={setResultType}
          />
        </div>
        {errors.resultName && (
          <p className="inline-error">{errors.resultName}</p>
        )}
        <p className="function-authoring-note">
          Existing connections are preserved by argument identity. Removing or
          changing the type of a connected argument is blocked.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="function-create" disabled={hasErrors}>
            Apply signature
          </button>
        </div>
      </form>
    </div>
  );
}

function CaptureEditDialog({
  templateId,
  initialCaptures,
  onApply,
  onCancel,
}: {
  templateId: string;
  initialCaptures: Array<{ key: string; type: CoreType }>;
  onApply: (edit: TemplateCapturesEdit) => boolean;
  onCancel: () => void;
}) {
  const [captures, setCaptures] = useState<CaptureRow[]>(() =>
    initialCaptures.map((capture, index) => ({
      draftId: index + 1,
      originalKey: capture.key,
      key: capture.key,
      type: capture.type,
    })),
  );
  const nextDraftId = useRef(initialCaptures.length + 1);
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  captures.forEach((capture) => {
    if (!validProjectId(capture.key)) {
      errors[`capture-${capture.draftId}`] =
        capture.key.trim().length === 0
          ? "Capture name is required"
          : "Capture name must use ASCII letters, digits, underscores, hyphens, or periods.";
    }
    if (seen.has(capture.key)) {
      errors[`capture-${capture.draftId}`] = "Capture names must be unique";
    }
    seen.add(capture.key);
  });
  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function updateCapture(draftId: number, patch: Partial<CaptureRow>) {
    setCaptures((current) =>
      current.map((capture) =>
        capture.draftId === draftId ? { ...capture, ...patch } : capture,
      ),
    );
  }

  return (
    <div
      className="signature-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className="signature-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (hasErrors) return;
          if (
            onApply({
              templateId,
              captures: captures.map(({ originalKey, key, type }) => ({
                originalKey,
                key,
                type,
              })),
            })
          ) {
            onCancel();
          }
        }}
      >
        <div className="function-authoring-heading">
          <strong id="capture-dialog-title">Edit captures</strong>
          <button
            type="button"
            aria-label="Cancel capture edit"
            onClick={onCancel}
          >
            ×
          </button>
        </div>
        <section className="function-captures">
          <div className="function-captures-heading">
            <strong>Captures</strong>
            <button
              type="button"
              onClick={() =>
                setCaptures((current) => [
                  ...current,
                  {
                    draftId: nextDraftId.current++,
                    key: `capture_${current.length + 1}`,
                    type: "nat",
                  },
                ])
              }
            >
              Add capture
            </button>
          </div>
          {captures.length === 0 ? (
            <p>No captures declared.</p>
          ) : (
            captures.map((capture, index) => (
              <div className="function-capture-row" key={capture.draftId}>
                <label>
                  <span className="visually-hidden">
                    Capture {index + 1} name
                  </span>
                  <input
                    aria-label={`Capture ${index + 1} name`}
                    value={capture.key}
                    aria-invalid={Boolean(errors[`capture-${capture.draftId}`])}
                    onChange={(event) =>
                      updateCapture(capture.draftId, {
                        key: event.target.value,
                      })
                    }
                  />
                </label>
                <CoreTypeEditor
                  label={`Capture ${index + 1} type`}
                  value={capture.type}
                  onChange={(type) => updateCapture(capture.draftId, { type })}
                />
                <button
                  type="button"
                  aria-label={`Remove capture ${index + 1}`}
                  onClick={() =>
                    setCaptures((current) =>
                      current.filter((item) => item.draftId !== capture.draftId),
                    )
                  }
                >
                  ×
                </button>
                {errors[`capture-${capture.draftId}`] && (
                  <p className="inline-error">
                    {errors[`capture-${capture.draftId}`]}
                  </p>
                )}
              </div>
            ))
          )}
        </section>
        <button type="submit" disabled={hasErrors}>
          Apply captures
        </button>
      </form>
    </div>
  );
}

function CoreTypeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: CoreType;
  disabled: boolean;
  onChange: (type: CoreType) => void;
}) {
  return (
    <CoreTypeEditor
      label={label}
      value={value}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const inputId = `inspector-${label.toLowerCase()}`;
  return (
    <label htmlFor={inputId}>
      {label}
      <input
        id={inputId}
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number(draft);
          if (Number.isInteger(parsed)) onCommit(parsed);
        }}
      />
    </label>
  );
}

function ElementInspector({
  element,
  connectedWires,
  surfaceFunction,
  onBoundsChange,
  onNatValueChange,
  onBoolValueChange,
  onElementTypeChange,
  onApplyTypesChange,
  onPairTypesChange,
  onSumTypesChange,
  onCaseTypesChange,
  onListItemTypeChange,
  onListRecTypesChange,
  onFocusTemplate,
  onOpenStandardLibraryDefinition,
  onError,
}: {
  element: ProjectElement;
  connectedWires: string[];
  surfaceFunction?: NonNullable<ProjectDocument["surfaceFunctions"]>[number];
  onBoundsChange: (id: string, bounds: Bounds) => void;
  onNatValueChange: (id: string, value: string) => void;
  onBoolValueChange: (id: string, value: boolean) => void;
  onElementTypeChange: (id: string, type: CoreType) => void;
  onApplyTypesChange: (
    id: string,
    parameterType: CoreType,
    resultType: CoreType,
  ) => void;
  onPairTypesChange: (
    id: string,
    leftType: CoreType,
    rightType: CoreType,
  ) => void;
  onSumTypesChange: (
    id: string,
    leftType: CoreType,
    rightType: CoreType,
  ) => void;
  onCaseTypesChange: (
    id: string,
    leftType: CoreType,
    rightType: CoreType,
    resultType: CoreType,
  ) => void;
  onListItemTypeChange: (id: string, itemType: CoreType) => void;
  onListRecTypesChange: (
    id: string,
    itemType: CoreType,
    resultType: CoreType,
  ) => void;
  onFocusTemplate: (templateId: string) => void;
  onOpenStandardLibraryDefinition: (definition: StandardLibraryFunction) => void;
  onError: (error: string | null) => void;
}) {
  const natValue =
    element.kind === "nat_literal" ? element.properties.value : null;
  const [natDraft, setNatDraft] = useState(natValue ?? "");
  useEffect(() => {
    if (natValue !== null) setNatDraft(natValue);
  }, [natValue]);

  function updateBound(key: keyof Bounds, value: number) {
    if ((key === "width" || key === "height") && value <= 0) {
      onError(`${key} must be a positive integer.`);
      return;
    }
    onError(null);
    onBoundsChange(element.id, { ...element.bounds, [key]: value });
  }
  return (
    <>
      <div className="inspector-heading">
        <span className={`kind-chip kind-${element.kind}`}>{element.kind}</span>
        <h2>{element.id}</h2>
        <span className="read-only-label">Stable ID · read only</span>
      </div>
      <div className="field-grid">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <NumberField
            key={key}
            label={key.toUpperCase()}
            value={element.bounds[key]}
            onCommit={(value) => updateBound(key, value)}
          />
        ))}
      </div>
      {element.kind === "nat_literal" && (
        <label htmlFor="nat-value">
          Nat value
          <input
            id="nat-value"
            value={natDraft}
            onChange={(event) => {
              const value = event.target.value;
              setNatDraft(value);
              if (!/^(0|[1-9][0-9]*)$/.test(value)) {
                onError("Nat value must be a canonical decimal string.");
                return;
              }
              onError(null);
              onNatValueChange(element.id, value);
            }}
          />
        </label>
      )}
      {element.kind === "bool_literal" && (
        <label htmlFor="bool-value">
          Bool value
          <select
            id="bool-value"
            value={element.properties.value ? "true" : "false"}
            onChange={(event) => {
              onError(null);
              onBoolValueChange(element.id, event.target.value === "true");
            }}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </label>
      )}
      {(element.kind === "drop" || element.kind === "copy") && (
        <CoreTypeField
          label="Value type"
          value={element.properties.type}
          disabled={connectedWires.length > 0}
          onChange={(type) => onElementTypeChange(element.id, type)}
        />
      )}
      {(element.kind === "bool_rec" || element.kind === "nat_rec") && (
        <>
          <CoreTypeField
            label="Accumulator / result type"
            value={element.properties.type}
            disabled={connectedWires.length > 0}
            onChange={(type) => onElementTypeChange(element.id, type)}
          />
          <p className="limitation">
            {element.kind === "nat_rec"
              ? "The type accumulated during iteration and returned as the final result. The count input is always Nat."
              : "The type used by both branches and returned as the final result. The condition input is always Bool."}
          </p>
          {connectedWires.length > 0 && (
            <p className="limitation">
              Disconnect related wires before changing this type manually. A new
              default Rec can infer this type from the first compatible branch,
              base, step, or result connection.
            </p>
          )}
        </>
      )}
      {element.kind === "apply" && (
        <>
          <CoreTypeField
            label="Parameter type"
            value={element.properties.parameterType}
            disabled={connectedWires.length > 0}
            onChange={(parameterType) =>
              onApplyTypesChange(
                element.id,
                parameterType,
                element.properties.resultType,
              )
            }
          />
          <CoreTypeField
            label="Result type"
            value={element.properties.resultType}
            disabled={connectedWires.length > 0}
            onChange={(resultType) =>
              onApplyTypesChange(
                element.id,
                element.properties.parameterType,
                resultType,
              )
            }
          />
        </>
      )}
      {(element.kind === "pair" || element.kind === "unpair") && (
        <>
          <CoreTypeField
            label="Left type"
            value={element.properties.leftType}
            disabled={connectedWires.length > 0}
            onChange={(leftType) =>
              onPairTypesChange(
                element.id,
                leftType,
                element.properties.rightType,
              )
            }
          />
          <CoreTypeField
            label="Right type"
            value={element.properties.rightType}
            disabled={connectedWires.length > 0}
            onChange={(rightType) =>
              onPairTypesChange(
                element.id,
                element.properties.leftType,
                rightType,
              )
            }
          />
          <p className="limitation">
            Product nodes preserve both components explicitly. Use Unpair and
            Drop any component that is not needed.
          </p>
        </>
      )}
      {(element.kind === "left" || element.kind === "right") && (
        <>
          <CoreTypeField
            label="Left alternative"
            value={element.properties.leftType}
            disabled={connectedWires.length > 0}
            onChange={(leftType) =>
              onSumTypesChange(
                element.id,
                leftType,
                element.properties.rightType,
              )
            }
          />
          <CoreTypeField
            label="Right alternative"
            value={element.properties.rightType}
            disabled={connectedWires.length > 0}
            onChange={(rightType) =>
              onSumTypesChange(
                element.id,
                element.properties.leftType,
                rightType,
              )
            }
          />
          <p className="limitation">
            Sum nodes preserve the selected Left or Right tag. Use Case to
            choose a branch.
          </p>
        </>
      )}
      {element.kind === "case" && (
        <>
          <CoreTypeField
            label="Left alternative"
            value={element.properties.leftType}
            disabled={connectedWires.length > 0}
            onChange={(leftType) =>
              onCaseTypesChange(
                element.id,
                leftType,
                element.properties.rightType,
                element.properties.resultType,
              )
            }
          />
          <CoreTypeField
            label="Right alternative"
            value={element.properties.rightType}
            disabled={connectedWires.length > 0}
            onChange={(rightType) =>
              onCaseTypesChange(
                element.id,
                element.properties.leftType,
                rightType,
                element.properties.resultType,
              )
            }
          />
          <CoreTypeField
            label="Result type"
            value={element.properties.resultType}
            disabled={connectedWires.length > 0}
            onChange={(resultType) =>
              onCaseTypesChange(
                element.id,
                element.properties.leftType,
                element.properties.rightType,
                resultType,
              )
            }
          />
          <p className="limitation">
            Case applies only the selected branch closure. Both branch closures
            must return the same result type.
          </p>
        </>
      )}
      {(element.kind === "nil" || element.kind === "cons") && (
        <>
          <CoreTypeField
            label="Item type"
            value={element.properties.itemType}
            disabled={connectedWires.length > 0}
            onChange={(itemType) =>
              onListItemTypeChange(element.id, itemType)
            }
          />
          <p className="limitation">
            List constructors preserve element order. Cons consumes one item and
            the remaining List of the same item type.
          </p>
        </>
      )}
      {element.kind === "list_rec" && (
        <>
          <CoreTypeField
            label="Item type"
            value={element.properties.itemType}
            disabled={connectedWires.length > 0}
            onChange={(itemType) =>
              onListRecTypesChange(
                element.id,
                itemType,
                element.properties.resultType,
              )
            }
          />
          <CoreTypeField
            label="Result type"
            value={element.properties.resultType}
            disabled={connectedWires.length > 0}
            onChange={(resultType) =>
              onListRecTypesChange(
                element.id,
                element.properties.itemType,
                resultType,
              )
            }
          />
          <p className="limitation">
            ListRec applies the step closure once per Cons cell. The step
            parameter is head × (tail × recursive result).
          </p>
        </>
      )}
      {element.kind === "function" && (
        <section className="readout">
          <h3>Function template</h3>
          {standardLibraryFunction(element.properties.templateId) && (
            <span className="read-only-label">Standard Library · read only</span>
          )}
          <code>
            {surfaceFunction?.name ??
              standardLibraryFunction(element.properties.templateId)
                ?.displayName ??
              element.properties.templateId}
          </code>
          {surfaceFunction && (
            <span>
              {surfaceFunction.parameters
                .map(
                  (parameter) =>
                    `${parameter.name}: ${formatCoreType(parameter.type)}`,
                )
                .join(", ")}{" "}
              {"->"} {surfaceFunction.result.name}:{" "}
              {formatCoreType(surfaceFunction.result.type)}
            </span>
          )}
          <span>
            {formatCoreType(element.properties.parameterType)} {"->"}{" "}
            {formatCoreType(element.properties.resultType)}
          </span>
          <span>
            {element.properties.captures.length === 0
              ? "No captures"
              : `${element.properties.captures.length} capture(s)`}
          </span>
          <p className="limitation">
            The signature is owned by the template container and is read only
            on this closure.
          </p>
          {standardLibraryFunction(element.properties.templateId) ? (
            <button
              type="button"
              onClick={() =>
                onOpenStandardLibraryDefinition(
                  standardLibraryFunction(element.properties.templateId)!,
                )
              }
            >
              Open Standard Library definition{" "}
              {standardLibraryFunction(element.properties.templateId)?.displayName}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onFocusTemplate(element.properties.templateId)
              }
            >
              Open template {element.properties.templateId}
            </button>
          )}
        </section>
      )}
      {element.kind === "library_call" && (
        <section className="readout">
          <h3>Standard Library call</h3>
          <span className="read-only-label">Standard Library · folded call</span>
          <code>
            {standardLibraryFunction(element.properties.templateId)
              ?.displayName ?? element.properties.templateId}
          </code>
          <span>
            {standardLibraryFunction(element.properties.templateId)?.parameters
              .map((parameter) => formatCoreType(parameter.type))
              .join(" · ")}{" "}
            {"->"}{" "}
            {formatCoreType(
              standardLibraryFunction(element.properties.templateId)
                ?.resultType ?? "unit",
            )}
          </span>
          <p className="limitation">
            This Surface call expands to the immutable Standard Library Core
            definition during execution.
          </p>
          {standardLibraryFunction(element.properties.templateId) && (
            <button
              type="button"
              onClick={() =>
                onOpenStandardLibraryDefinition(
                  standardLibraryFunction(element.properties.templateId)!,
                )
              }
            >
              Open Standard Library definition{" "}
              {standardLibraryFunction(element.properties.templateId)?.displayName}
            </button>
          )}
        </section>
      )}
      {element.kind === "project_call" && (
        <section className="readout">
          <h3>Function call</h3>
          <code>{surfaceFunction?.name ?? element.properties.templateId}</code>
          {surfaceFunction ? (
            <span>
              {surfaceFunction.parameters
                .map(
                  (parameter) =>
                    `${parameter.name}: ${formatCoreType(parameter.type)}`,
                )
                .join(", ")}{" "}
              {"->"} {surfaceFunction.result.name}:{" "}
              {formatCoreType(surfaceFunction.result.type)}
            </span>
          ) : (
            <span className="limitation">
              The referenced function template is missing.
            </span>
          )}
          {surfaceFunction && (
            <button
              type="button"
              onClick={() => onFocusTemplate(element.properties.templateId)}
            >
              Open function {surfaceFunction.name}
            </button>
          )}
        </section>
      )}
      <section className="readout">
        <h3>Port anchors</h3>
        {element.portAnchors.map((anchor) => (
          <code key={anchor.port}>
            {anchor.port} ({anchor.x}, {anchor.y})
          </code>
        ))}
      </section>
      <section className="readout">
        <h3>References</h3>
        {connectedWires.length === 0 ? (
          <span>No wire hints reference this element.</span>
        ) : (
          <>
            {connectedWires.map((wire) => (
              <code key={wire}>{wire}</code>
            ))}
            <p className="limitation">
              Deleting this element also deletes these connected wires. Type
              editing is disabled until they are disconnected.
            </p>
          </>
        )}
      </section>
    </>
  );
}

export function Inspector({
  document,
  selection,
  error,
  onBoundsChange,
  onNatValueChange,
  onBoolValueChange,
  onElementTypeChange,
  onApplyTypesChange,
  onPairTypesChange,
  onSumTypesChange,
  onCaseTypesChange,
  onListItemTypeChange,
  onListRecTypesChange,
  onEntryResultTypeChange,
  canDelete,
  onDelete,
  onFocusTemplate,
  onOpenStandardLibraryDefinition,
  onFocusEntry,
  callerReturn,
  standardLibraryDefinition,
  onBackFromStandardLibraryDefinition,
  onEditSignature,
  onEditCaptures,
  onFitContainer,
  onFitViewToContainer,
  onAutoLayoutContainer,
  onError,
}: InspectorProps) {
  const [editingSignature, setEditingSignature] =
    useState<SurfaceFunctionMetadata | null>(null);
  const [editingCaptures, setEditingCaptures] =
    useState<ProjectDocument["geometry"]["containers"][number] | null>(null);
  let content = (
    <div className="empty-inspector">
      <div className="empty-icon" aria-hidden="true">
        ↖
      </div>
      <h2>No selection</h2>
      <p>
        Select an element, container, boundary, wire, or junction on the canvas.
      </p>
    </div>
  );
  if (standardLibraryDefinition) {
    content = (
      <>
        <div className="inspector-heading">
          <span className="kind-chip">standard library</span>
          <h2>{standardLibraryDefinition.displayName}</h2>
          <span className="read-only-label">Immutable definition · read only</span>
        </div>
        <section className="readout">
          <h3>Signature</h3>
          <span>
            {standardLibraryDefinition.parameters
              .map((parameter) => formatCoreType(parameter.type))
              .join(" -> ")}{" "}
            {"->"} {formatCoreType(standardLibraryDefinition.resultType)}
          </span>
          <code>
            {standardLibraryDefinition.library}/
            {standardLibraryDefinition.functionId}@
            {standardLibraryDefinition.version}
          </code>
        </section>
        <p className="limitation">
          This definition is supplied by Tilefold and is not copied into the
          project. Transparent execution lowers it to ordinary Core templates;
          fast execution evaluates the verified Standard Library identity.
        </p>
        <button type="button" onClick={onBackFromStandardLibraryDefinition}>
          Back to call
        </button>
      </>
    );
  } else if (selection?.type === "element") {
    const element = document.geometry.elements.find(
      (candidate) => candidate.id === selection.id,
    );
    if (element) {
      const connectedWires = document.geometry.wires
        .filter(
          (wire) =>
            (wire.sourceHint?.kind === "element_port" &&
              wire.sourceHint.elementId === element.id) ||
            (wire.targetHint?.kind === "element_port" &&
              wire.targetHint.elementId === element.id),
        )
        .map((wire) => wire.id);
      content = (
        <ElementInspector
          element={element}
          connectedWires={connectedWires}
          surfaceFunction={
            element.kind === "function" || element.kind === "project_call"
              ? document.surfaceFunctions?.find(
                  (candidate) =>
                    candidate.templateId === element.properties.templateId,
                )
              : undefined
          }
          onBoundsChange={onBoundsChange}
          onNatValueChange={onNatValueChange}
          onBoolValueChange={onBoolValueChange}
          onElementTypeChange={onElementTypeChange}
          onApplyTypesChange={onApplyTypesChange}
          onPairTypesChange={onPairTypesChange}
          onSumTypesChange={onSumTypesChange}
          onCaseTypesChange={onCaseTypesChange}
          onListItemTypeChange={onListItemTypeChange}
          onListRecTypesChange={onListRecTypesChange}
          onFocusTemplate={onFocusTemplate}
          onOpenStandardLibraryDefinition={onOpenStandardLibraryDefinition}
          onError={onError}
        />
      );
    }
  } else if (selection?.type === "boundary") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === selection.containerId,
    );
    const boundary = container?.boundaryPorts.find(
      (candidate) => candidate.id === selection.id,
    );
    if (container && boundary) {
      const connectedWires = document.geometry.wires
        .filter(
          (wire) =>
            (wire.sourceHint?.kind === "boundary_port" &&
              wire.sourceHint.containerId === container.id &&
              wire.sourceHint.boundaryId === boundary.id) ||
            (wire.targetHint?.kind === "boundary_port" &&
              wire.targetHint.containerId === container.id &&
              wire.targetHint.boundaryId === boundary.id),
        )
        .map((wire) => wire.id);
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">{boundary.role} boundary</span>
            <h2>{boundary.id}</h2>
            <span className="read-only-label">
              Container {container.id}
            </span>
          </div>
          <code>
            anchor ({boundary.anchor.x}, {boundary.anchor.y})
          </code>
          <section className="readout">
            <h3>Type</h3>
            <span>{formatCoreType(boundary.type)}</span>
          </section>
          {container.kind.kind === "entry" && boundary.role === "result" && (
            <section className="readout">
              <h3>Entry result</h3>
              <CoreTypeEditor
                label="Entry output type"
                value={boundary.type}
                onChange={(resultType) =>
                  onEntryResultTypeChange(container.id, resultType)
                }
                disabled={connectedWires.length > 0}
              />
              {connectedWires.length > 0 && (
                <p className="limitation">
                  Disconnect entry result wire(s) before changing this type:{" "}
                  {connectedWires.join(", ")}
                </p>
              )}
            </section>
          )}
          {boundary.role !== "result" && (
            <p className="limitation">
              Parameter and capture boundaries are structural and cannot be
              deleted directly.
            </p>
          )}
        </>
      );
    }
  } else if (selection?.type === "container") {
    const container = document.geometry.containers.find(
      (candidate) => candidate.id === selection.id,
    );
    if (container) {
      const functionReferences = templateFunctionReferences(
        document,
        container.kind.templateId,
        container.id,
      );
      const surfaceFunction = document.surfaceFunctions?.find(
        (candidate) => candidate.templateId === container.kind.templateId,
      );
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">container</span>
            <h2>{container.id}</h2>
          </div>
          <p>{container.kind.kind} container</p>
          <code>
            {surfaceFunction
              ? `function ${surfaceFunction.name}`
              : `template ${container.kind.templateId}`}
          </code>
          {surfaceFunction && (
            <section className="readout">
              <h3>Surface signature</h3>
              <span>
                {surfaceFunction.name}(
                {surfaceFunction.parameters
                  .map(
                    (parameter) =>
                      `${parameter.name}: ${formatCoreType(parameter.type)}`,
                  )
                  .join(", ")}
                ) {"->"} {surfaceFunction.result.name}:{" "}
                {formatCoreType(surfaceFunction.result.type)}
              </span>
              <button type="button" onClick={onFocusEntry}>
                Return to entry graph
              </button>
              {callerReturn && callerReturn.containerId !== container.id && (
                <button type="button" onClick={callerReturn.onReturn}>
                  Back to {callerReturn.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingSignature(surfaceFunction)}
              >
                Edit signature
              </button>
            </section>
          )}
          {container.kind.kind === "template" && (
            <span>
              {formatCoreType(container.kind.parameterType)} {"->"}{" "}
              {formatCoreType(container.kind.resultType)}
            </span>
          )}
          {container.kind.kind === "entry" && (
            <section className="readout">
              <h3>Signature</h3>
              <span>Unit {"->"} {formatCoreType(container.kind.resultType)}</span>
              <CoreTypeEditor
                label="Entry output type"
                value={container.kind.resultType}
                onChange={(resultType) =>
                  onEntryResultTypeChange(container.id, resultType)
                }
                disabled={document.geometry.wires.some((wire) =>
                  container.boundaryPorts
                    .filter((boundary) => boundary.role === "result")
                    .some(
                      (boundary) =>
                        (wire.sourceHint?.kind === "boundary_port" &&
                          wire.sourceHint.containerId === container.id &&
                          wire.sourceHint.boundaryId === boundary.id) ||
                        (wire.targetHint?.kind === "boundary_port" &&
                          wire.targetHint.containerId === container.id &&
                          wire.targetHint.boundaryId === boundary.id),
                    ),
                )}
              />
              <p className="limitation">
                The entry parameter is fixed to Unit. The result may be any
                valid Core type.
              </p>
            </section>
          )}
          {container.kind.kind === "template" && (
            <section className="readout">
              <h3>Captures</h3>
              {templateCaptureDrafts(document, container.kind.templateId).length === 0 ? (
                <span>No captures</span>
              ) : (
                templateCaptureDrafts(document, container.kind.templateId).map(
                  (capture) => (
                    <code key={capture.key}>
                      {capture.key}: {formatCoreType(capture.type)}
                    </code>
                  ),
                )
              )}
              <button
                type="button"
                onClick={() => setEditingCaptures(container)}
              >
                Edit captures
              </button>
            </section>
          )}
          <span>
            {container.kind.dependencies.length === 0
              ? "No template dependencies"
              : `Dependencies: ${container.kind.dependencies.join(", ")}`}
          </span>
          <section className="readout">
            <h3>Container geometry</h3>
            <button type="button" onClick={() => onFitContainer(container.id)}>
              Fit to content
            </button>
            <button
              type="button"
              onClick={() => onFitViewToContainer(container.id)}
              aria-label={`Fit container view to ${container.id}`}
              title="Fit the current canvas view to this container without changing the project"
            >
              Fit container view
            </button>
            <button
              type="button"
              onClick={() => onAutoLayoutContainer(container.id)}
              aria-label={`Auto Layout ${container.id}`}
              title="Automatically arrange this container and its child containers without changing program meaning"
            >
              Auto Layout inside
            </button>
          </section>
          {container.kind.dependencies.length > 0 && (
            <section className="readout">
              <h3>Open dependency</h3>
              {container.kind.dependencies.map((dependency) => (
                <button
                  key={dependency}
                  type="button"
                  onClick={() => onFocusTemplate(dependency)}
                >
                  {dependency}
                </button>
              ))}
            </section>
          )}
          {container.kind.kind === "template" && (
            <section className="readout">
              <h3>Template deletion</h3>
              {functionReferences.length === 0 ? (
                <>
                  <span>
                    No external Function references. This template can be
                    deleted with its contents.
                  </span>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() => {
                      const label = surfaceFunction?.name ?? container.kind.templateId;
                      if (
                        window.confirm(`Delete function ${label}? This cannot be undone except through Undo.`)
                      ) {
                        onDelete();
                      }
                    }}
                  >
                    Delete function
                  </button>
                </>
              ) : (
                <>
                  <span>Delete these Function references first:</span>
                  {functionReferences.map((reference) => (
                    <code key={reference}>{reference}</code>
                  ))}
                </>
              )}
            </section>
          )}
          <code>
            {container.bounds.x}, {container.bounds.y} ·{" "}
            {container.bounds.width}×{container.bounds.height}
          </code>
          {container.kind.kind === "entry" ? (
            <p className="limitation">Entry geometry is not movable.</p>
          ) : (
            <p className="limitation">
              Drag the template header to move the container and its contents.
            </p>
          )}
        </>
      );
    }
  } else if (selection?.type === "wire") {
    const wire = document.geometry.wires.find(
      (candidate) => candidate.id === selection.id,
    );
    if (wire) {
      const sourceAvailability = wireEndpointAvailability(
        document,
        wire,
        "source",
      );
      const targetAvailability = wireEndpointAvailability(
        document,
        wire,
        "target",
      );
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">wire</span>
            <h2>{wire.id}</h2>
          </div>
          <p>{wire.points.length} ordered polyline points</p>
          {wire.points.map((point, index) => (
            <code key={`${index}-${point.x}-${point.y}`}>
              {index}: ({point.x}, {point.y})
            </code>
          ))}
          <section className="readout">
            <h3>Endpoint hints · read only</h3>
            <code>{JSON.stringify(wire.sourceHint ?? null)}</code>
            <code>{JSON.stringify(wire.targetHint ?? null)}</code>
          </section>
          <section className="readout">
            <h3>Endpoint reconnection</h3>
            <span>
              Source:{" "}
              {sourceAvailability.available
                ? "available"
                : sourceAvailability.reason}
            </span>
            <span>
              Target:{" "}
              {targetAvailability.available
                ? "available"
                : targetAvailability.reason}
            </span>
            {(sourceAvailability.available ||
              targetAvailability.available) && (
              <p>
                Drag an S or T endpoint handle on the selected wire to reconnect
                it.
              </p>
            )}
          </section>
        </>
      );
    }
  } else if (selection?.type === "junction") {
    const junction = document.geometry.junctions.find(
      (candidate) => candidate.id === selection.id,
    );
    if (junction) {
      content = (
        <>
          <div className="inspector-heading">
            <span className="kind-chip">junction</span>
            <h2>{junction.id}</h2>
          </div>
          <p>
            ({junction.anchor.x}, {junction.anchor.y})
          </p>
          {junction.outlets.map((outlet) => (
            <code key={outlet.id}>
              order {outlet.order}: {outlet.id}
            </code>
          ))}
        </>
      );
    }
  }

  return (
    <aside className="inspector" aria-label="Inspector">
      {!selection && (
        <section className="project-summary">
          <span className="kind-chip">project</span>
          <h2>{document.format} v{document.version}</h2>
          <div className="summary-grid">
            <span>{document.geometry.elements.length}<small>elements</small></span>
            <span>{document.geometry.containers.length}<small>containers</small></span>
            <span>{document.geometry.wires.length}<small>wires</small></span>
            <span>{document.geometry.junctions.length}<small>junctions</small></span>
          </div>
          <p className="structure-pass">Editor structure check passed</p>
          <p className="limitation">
            Semantic validation runs on demand in the browser OCaml worker.
          </p>
        </section>
      )}
      {content}
      {selection && (
        <section className="inspector-actions">
          <button type="button" onClick={onDelete} disabled={!canDelete}>
            Delete {selection.type} {selection.id}
          </button>
        </section>
      )}
      {document.view && (
        <section className="readout">
          <h3>Saved view</h3>
          <code>
            camera ({document.view.cameraX}, {document.view.cameraY}) · zoom{" "}
            {document.view.zoom}
          </code>
        </section>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {editingSignature && (
        <SignatureEditDialog
          document={document}
          surfaceFunction={editingSignature}
          onCancel={() => setEditingSignature(null)}
          onApply={onEditSignature}
        />
      )}
      {editingCaptures && editingCaptures.kind.kind === "template" && (
        <CaptureEditDialog
          templateId={editingCaptures.kind.templateId}
          initialCaptures={templateCaptureDrafts(
            document,
            editingCaptures.kind.templateId,
          )}
          onCancel={() => setEditingCaptures(null)}
          onApply={onEditCaptures}
        />
      )}
    </aside>
  );
}
