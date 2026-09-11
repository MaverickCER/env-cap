import { defineEvidenceProjection } from "env-cap/evidence";

/**
 * The "Configuration Dependency" reference projection (plan Phase 20) --
 * where the DOT/Mermaid/JSON graph-export rendering ADR 0027 explicitly
 * deferred out of Dependency Model itself now lives, as pure rendering over
 * Dependency Model's data. Unlike every projection before it, this one has
 * no existing `env-cap/build` renderer to reshape into at
 * all -- `dependency-model.ts`'s own module doc comment says as much
 * ("Graph-format rendering ... is deliberately not here -- that's
 * presentation over this model's data, not the model itself"). This is
 * genuinely new rendering logic, not a thin reshape.
 *
 * Graph shape: one node per contract, one node per consuming file, one
 * directed edge per "this file consumes this contract" relationship
 * (`DependencyModel.consumers`, ADR 0027's inverse index -- built for
 * exactly this kind of use, not previously exposed as a render).
 */

function graphNodesAndEdges(evidence) {
  const contractNodes = evidence.dependency.contracts.map((contract) => ({
    id: `contract:${contract.file}#${contract.exportName}`,
    type: "contract",
    label: contract.contractName,
    file: contract.file,
    exportName: contract.exportName,
  }));

  const fileNodes = evidence.dependency.consumers.map((consumer) => ({
    id: `file:${consumer.file}`,
    type: "file",
    label: consumer.file,
    file: consumer.file,
  }));

  const edges = evidence.dependency.consumers.flatMap((consumer) =>
    consumer.contracts.map((ref) => ({
      from: `file:${consumer.file}`,
      to: `contract:${ref.file}#${ref.exportName}`,
    })),
  );

  return { nodes: [...contractNodes, ...fileNodes], edges };
}

function dotId(id) {
  // Escape backslashes before quotes -- otherwise a backslash in `id` (e.g.
  // a Windows-style path) isn't itself escaped, so it can combine with the
  // character that follows to break out of the DOT quoted-string context.
  return `"${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toDot(evidence) {
  const { nodes, edges } = graphNodesAndEdges(evidence);
  const lines = ["digraph ConfigurationDependency {", "  rankdir=LR;"];
  for (const node of nodes) {
    const shape = node.type === "contract" ? "box" : "ellipse";
    lines.push(`  ${dotId(node.id)} [label=${dotId(node.label)}, shape=${shape}];`);
  }
  for (const edge of edges) {
    lines.push(`  ${dotId(edge.from)} -> ${dotId(edge.to)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function mermaidId(id) {
  // Mermaid node IDs can't contain most punctuation -- hash-free, readable
  // substitution is enough for this reference projection's own fixture
  // sizes; a consumer with adversarial file paths would want a real slug.
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function toMermaid(evidence) {
  const { nodes, edges } = graphNodesAndEdges(evidence);
  const lines = ["flowchart LR"];
  for (const node of nodes) {
    const shape =
      node.type === "contract" ? `["${node.label}"]` : `("${node.label}")`;
    lines.push(`  ${mermaidId(node.id)}${shape}`);
  }
  for (const edge of edges) {
    lines.push(`  ${mermaidId(edge.from)} --> ${mermaidId(edge.to)}`);
  }
  return lines.join("\n");
}

export const dependencyGraphProjection = defineEvidenceProjection({
  dot: (evidence) => toDot(evidence),
  mermaid: (evidence) => toMermaid(evidence),
  json: (evidence) => graphNodesAndEdges(evidence),
});
