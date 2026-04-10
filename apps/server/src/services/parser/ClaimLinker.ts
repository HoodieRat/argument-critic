export interface ClaimLink {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly linkType: "supports" | "depends_on" | "contrasts_with";
  readonly explanation: string;
}

export class ClaimLinker {
  public linkClaims(claims: string[]): ClaimLink[] {
    const links: ClaimLink[] = [];
    for (let index = 0; index < claims.length - 1; index += 1) {
      const current = claims[index]?.toLowerCase() ?? "";
      const nextIndex = index + 1;

      if (current.includes("because")) {
        links.push({
          fromIndex: index,
          toIndex: nextIndex,
          linkType: "supports",
          explanation: "Uses explicit support language."
        });
      } else if (current.includes("however") || current.includes("but")) {
        links.push({
          fromIndex: index,
          toIndex: nextIndex,
          linkType: "contrasts_with",
          explanation: "Introduces a contrast."
        });
      } else {
        links.push({
          fromIndex: index,
          toIndex: nextIndex,
          linkType: "depends_on",
          explanation: "Appears in the same reasoning chain."
        });
      }
    }

    return links;
  }
}