import type { Bounds, ProjectContainer, ProjectDocument, ProjectElement, StableId } from "./project";

function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function containerArea(container: ProjectContainer): number {
  return container.bounds.width * container.bounds.height;
}

function ownerContainerForElement(
  containers: ProjectContainer[],
  element: ProjectElement,
): ProjectContainer | undefined {
  return containers
    .filter((container) => containsBounds(container.bounds, element.bounds))
    .sort((left, right) => containerArea(left) - containerArea(right))[0];
}

function referencedTemplate(element: ProjectElement): StableId | null {
  switch (element.kind) {
    case "function":
      return element.properties.templateId;
    case "project_call":
      return element.properties.templateId;
    case "library_call":
      return element.properties.templateId;
    default:
      return null;
  }
}

export function recomputeContainerDependencies(document: ProjectDocument): ProjectDocument {
  const dependenciesByContainer = new Map<StableId, Set<StableId>>();
  for (const container of document.geometry.containers) {
    dependenciesByContainer.set(container.id, new Set());
  }
  for (const element of document.geometry.elements) {
    const templateId = referencedTemplate(element);
    if (!templateId) continue;
    const owner = ownerContainerForElement(document.geometry.containers, element);
    if (!owner) continue;
    dependenciesByContainer.get(owner.id)?.add(templateId);
  }
  return {
    ...document,
    geometry: {
      ...document.geometry,
      containers: document.geometry.containers.map((container) => {
        const dependencies = [...(dependenciesByContainer.get(container.id) ?? [])].sort();
        if (
          dependencies.length === container.kind.dependencies.length &&
          dependencies.every((dependency, index) => dependency === container.kind.dependencies[index])
        ) {
          return container;
        }
        return {
          ...container,
          kind: {
            ...container.kind,
            dependencies,
          },
        };
      }),
    },
  };
}
