export type DecisionStrategy = "procedural_only" | "hybrid" | "ai_first";

export class DecisionMatrix {
  public determine(input: { route: string; interpret?: boolean; hasStoredMatches?: boolean }): DecisionStrategy {
    if (input.route === "database") {
      return input.interpret ? "hybrid" : "procedural_only";
    }

    if (input.route === "report") {
      return input.interpret ? "hybrid" : "procedural_only";
    }

    if (input.route === "critic") {
      return "ai_first";
    }

    if (input.hasStoredMatches) {
      return "hybrid";
    }

    return "ai_first";
  }
}