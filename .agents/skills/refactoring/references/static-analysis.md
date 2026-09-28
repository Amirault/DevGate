# RFC: Code static analysis

Date: 2025-07-22

Authors:

* Laurent Gaël

Status: Adopted

## Executive Summary

This RFC proposes to implement comprehensive static analysis on the monorepo to improve code quality, security, and
maintainability.

This will be applied and enforced on the monolith.

## Context and Motivation

We currently lack of standardized code quality checks. There is code analysis in the monolith pipeline which is late in
the
build process and is not so frequently reviewed. It could be improved and shifted left.

## Proposed Standard

### Scope

It will apply to the monolith but should be applied to all the code in the monorepo.

### Specification

Static analysis whether it be for code quality, security (SAST), dependencies analysis, ...
The tool should not be configured too strictly and should start from an acceptable baseline then be made stricter
afterward to avoid any "big bang".

## Implementation Plan

For the monolith, for example, we are going to enable static analysis by default and turn all warnings into errors.
Example in a csproj:

```xml
    <AnalysisLevel>latest</AnalysisLevel>
    <AnalysisMode>Default</AnalysisMode>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <CodeAnalysisTreatWarningsAsErrors>true</CodeAnalysisTreatWarningsAsErrors>
```

It will be possible to ignore some rules at the beginning in order not to block delivery and to establish a baseline.
Then reactivate them in small increments after fixing those errors.

We can then make the analysis stricter and add other analyzers like Sonar's as we progress. The idea is not to
over-configure the tools and to keep the default configuration as much as possible to be dogmatic and not open
ourselves up to over-configuration.

## Impact Analysis

All monorepo resources are subject to this standard.
This will allow code standards to be applied as early as possible.

## Benefits and Advantages

### Code Quality and Maintainability

- **Objective Quality Metrics:** Remove subjectivity from code quality assessment
- **Early Bug Detection:** Static analysis can identify 60-80% of bugs before runtime
- **Consistent Standards:** Enforce uniform coding patterns across all teams
- **Technical Debt Management:** Track and prioritize technical debt reduction

### Developer Experience

- **Real-time Feedback:** IDE integration provides immediate quality feedback
- **Faster Onboarding:** New developers receive automated guidance on coding standards
- **Reduced Review Time:** Automated checks reduce manual review overhead
- **Learning Opportunities:** Static analysis helps developers improve coding skills

### Performance and Efficiency

- **Reduced Debugging Time:** Early issue detection reduces time spent on bug fixes
- **Improved Maintainability:** Consistent code quality makes future changes easier
- **Security Enhancement:** Automated vulnerability detection improves overall security posture

### Collaboration

- **Shared Quality Standards:** Common understanding of code quality expectations
- **Cross-team Consistency:** Uniform standards across different teams and projects
- **Knowledge Sharing:** Quality metrics facilitate technical discussions

## Risks and Mitigations

| Risk                   | Likelihood | Impact | Mitigation Strategy                                                                       |
|------------------------|------------|--------|-------------------------------------------------------------------------------------------|
| Developer Resistance   | Medium     | Medium | Gradual rollout, training sessions, highlight benefits                                    |
| False Positives        | Low        | Low    | We take rules as is                                                                       | 
| Performance Impact     | Low        | Medium | Optimize analysis configuration, use incremental scanning                                 |
| Tool Maintenance       | Medium     | Medium | Dedicated DevOps support, automated updates, monitoring                                   |
| Initial Technical Debt | High       | High   | Ignore blocking rule, phased approach, focus on new code first, dedicated cleanup sprints |

## Alternatives Considered

| Alternative              | Description                             | Pros                                 | Cons                                             | Why Rejected                                   |
|--------------------------|-----------------------------------------|--------------------------------------|--------------------------------------------------|------------------------------------------------|
| Manual Code Reviews Only | Rely solely on human reviewers          | Low tooling cost, Flexible standards | Inconsistent quality, Time-consuming, Subjective | Insufficient for large monolith scale          |
| Single Tool Solution     | Use only ESLint or only SonarQube       | Simpler setup, Lower cost            | Limited coverage, Missing security analysis      | Incomplete solution for comprehensive analysis |
| Custom In-house          | Build proprietary static analysis tools | Tailored to needs, Full control      | High development cost, Maintenance burden        | Not cost-effective compared to mature tools    |

## Compatibility with Existing Standards

### Complements Existing Standards:

- Enhances existing code review processes
- Integrates with current CI/CD practices
- Supports existing testing strategies

### New Standards Introduction:

- Introduces formal quality gates
- Establishes measurable code quality metrics
- Creates standardized reporting mechanisms

### No Conflicts:

- Does not replace existing development practices
- Adds automation layer to current processes
- Maintains flexibility for team-specific needs

## Examples and Implementation Guidance

For example, static analysis will be set using the default analyzer on the monolith. This analyzer will check the code
according to
classic C# coding rules.

### Before/After Examples

Here is an example with analysis of a possible null pointer:

Without analysis:
![without analysis](./img/2025-07-22-static-analysis-no-error.png)
With analysis:
![with analysis](./img/2025-07-22-static-analysis-error.png)

### Implementation Guidelines

1. Add a static analysis tool with minimal configuration and low level of verification
2. Ignore blocking rules
3. Enable a rule and fixe all its corresponding issue
4. Do step 3 until all errors are fixed
5. Harden the configuration of the tool is necessary

### Common Pitfalls

- **Over-configuration:** Start with default rules, customize gradually
- **Ignoring Legacy Code:** Focus on new code first, plan legacy improvements
- **Tool Fatigue:** Integrate tools seamlessly into existing workflow
- **Rigid Enforcement:** Allow justified exceptions with proper documentation

## Questions and Open Issues

List any unresolved questions or issues that need discussion:

- **Question 1:** Should we implement all rules immediately or use a gradual approach for legacy code?
    - Recommendation: Gradual approach focusing on new code first
- **Question 2:** How should we handle false positives and rule exceptions?
    - Recommendation: Implement exception approval process with documentation

## References and Resources

List relevant documentation, previous RFCs, research, or other resources:

* Link to related issues/tickets
* References to external documentation or research
* Previous related RFCs
* Domain knowledge resources
* Technical documentation

## Decision Log

To be filled out during the RFC process:

| Date       | Decision        | Rationale                  | Participants |
|------------|-----------------|----------------------------|--------------|
| 2025-07-31 | Propose the RFC | We need to start somewhere | Gaël LAURENT |

## Approval

To be completed when the RFC is approved:

Approved By: [Names and roles]

Approval Date: [Date of approval]

Comments: [Any final notes or conditions]