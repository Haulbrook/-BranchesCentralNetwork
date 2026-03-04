/**
 * Deconstruction and Rebuild Skill
 * Breaks down complex queries into manageable components and rebuilds them into actionable steps
 */
class DeconstructionRebuildSkill {
    constructor(config = {}) {
        this.config = config;
        this.enabled = config.enableDeconstructionSkill !== false;
        this.history = [];
        this.maxHistorySize = 50;

        // Apple Overseer integration
        this.appleOverseer = null;
        this.currentOperationId = null;

        // Complexity patterns to identify complex queries
        this.complexityIndicators = [
            { pattern: /\band\b/gi, weight: 1, name: 'multiple_conditions' },
            { pattern: /\bor\b/gi, weight: 1, name: 'alternatives' },
            { pattern: /\bif\b.*\bthen\b/gi, weight: 2, name: 'conditional_logic' },
            { pattern: /\bwhile\b|\bwhen\b/gi, weight: 1.5, name: 'temporal_conditions' },
            { pattern: /\bbecause\b|\bsince\b/gi, weight: 1.5, name: 'causal_relationships' },
            { pattern: /\bbut\b|\bhowever\b/gi, weight: 1, name: 'contrasts' },
            { pattern: /\bfirst\b.*\bthen\b.*\bfinally\b/gi, weight: 3, name: 'sequential_steps' },
            { pattern: /[,;]/g, weight: 0.5, name: 'multiple_clauses' },
            { pattern: /\b\d+\.\s/g, weight: 2, name: 'numbered_list' },
            { pattern: /\b(all|every|each)\b/gi, weight: 1, name: 'universal_quantifiers' }
        ];

        // Query component types
        this.componentTypes = {
            ACTION: 'action',
            CONDITION: 'condition',
            DATA: 'data',
            RESOURCE: 'resource',
            CONSTRAINT: 'constraint',
            GOAL: 'goal',
            SEQUENCE: 'sequence'
        };
    }

    /**
     * Connect to Apple Overseer for operation coordination
     */
    connectOverseer(overseer) {
        this.appleOverseer = overseer;
        console.log('✅ DeconstructionRebuildSkill connected to Apple Overseer');
    }

    /**
     * Analyze if query is complex enough to warrant deconstruction
     */
    isComplexQuery(query) {
        if (!this.enabled) return false;

        let complexityScore = 0;
        const indicators = [];

        for (const indicator of this.complexityIndicators) {
            const matches = query.match(indicator.pattern);
            if (matches) {
                complexityScore += matches.length * indicator.weight;
                indicators.push({
                    name: indicator.name,
                    count: matches.length,
                    contribution: matches.length * indicator.weight
                });
            }
        }

        // Word count contributes to complexity
        const wordCount = query.split(/\s+/).length;
        if (wordCount > 20) {
            complexityScore += (wordCount - 20) * 0.1;
            indicators.push({
                name: 'word_count',
                count: wordCount,
                contribution: (wordCount - 20) * 0.1
            });
        }

        return {
            isComplex: complexityScore >= 3,
            score: complexityScore,
            indicators: indicators,
            threshold: 3
        };
    }

    /**
     * Deconstruct a complex query into components
     */
    deconstruct(query) {
        const analysis = this.isComplexQuery(query);

        if (!analysis.isComplex) {
            return {
                success: false,
                reason: 'Query is not complex enough to warrant deconstruction',
                analysis: analysis
            };
        }

        // Split query into sentences and clauses
        const sentences = this.splitIntoSentences(query);
        const components = [];
        const relationships = [];

        // Analyze each sentence
        sentences.forEach((sentence, idx) => {
            const component = this.analyzeSentence(sentence, idx);
            if (component) {
                components.push(component);
            }
        });

        // Identify relationships between components
        for (let i = 0; i < components.length; i++) {
            for (let j = i + 1; j < components.length; j++) {
                const relationship = this.findRelationship(components[i], components[j]);
                if (relationship) {
                    relationships.push(relationship);
                }
            }
        }

        // Build dependency graph
        const dependencyGraph = this.buildDependencyGraph(components, relationships);

        return {
            success: true,
            originalQuery: query,
            analysis: analysis,
            components: components,
            relationships: relationships,
            dependencyGraph: dependencyGraph,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Rebuild deconstructed components into actionable plan
     */
    rebuild(deconstructedData) {
        if (!deconstructedData.success) {
            return {
                success: false,
                reason: 'Cannot rebuild unsuccessful deconstruction'
            };
        }

        const { components, dependencyGraph } = deconstructedData;

        // Sort components by dependencies (topological sort)
        const sortedComponents = this.topologicalSort(components, dependencyGraph);

        // Generate actionable steps
        const steps = sortedComponents.map((component, idx) => {
            return {
                id: `step_${idx + 1}`,
                order: idx + 1,
                description: this.generateStepDescription(component),
                component: component,
                dependencies: this.getComponentDependencies(component, dependencyGraph),
                estimatedComplexity: this.estimateComplexity(component),
                requiredResources: this.identifyResources(component),
                potentialIssues: this.identifyPotentialIssues(component)
            };
        });

        // Generate execution plan
        const executionPlan = {
            totalSteps: steps.length,
            estimatedDuration: this.estimateTotalDuration(steps),
            criticalPath: this.identifyCriticalPath(steps, dependencyGraph),
            parallelizable: this.identifyParallelSteps(steps, dependencyGraph),
            steps: steps
        };

        // Store in history
        this.addToHistory({
            deconstruction: deconstructedData,
            rebuild: executionPlan,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            originalQuery: deconstructedData.originalQuery,
            executionPlan: executionPlan,
            summary: this.generateSummary(executionPlan),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Process query end-to-end (deconstruct + rebuild)
     */
    process(query) {
        // Register operation with Apple Overseer
        if (this.appleOverseer) {
            this.currentOperationId = `deconstruct_${Date.now()}`;
            const registration = this.appleOverseer.registerOperation(this.currentOperationId, {
                tool: 'DeconstructionSkill',
                action: 'process',
                user: 'system',
                priority: 'high',
                resource: 'query_processing',
                details: {
                    queryLength: query.length,
                    queryPreview: query.substring(0, 50)
                }
            });

            // Check if operation was blocked
            if (!registration.success && registration.blocked) {
                console.warn('🍎 Deconstruction operation blocked by overseer:', registration.reason);
                return {
                    success: false,
                    reason: registration.reason,
                    blockedByOverseer: true,
                    recommendations: registration.recommendations
                };
            }
        }

        try {
            const startTime = Date.now();

            // Perform deconstruction
            const deconstructed = this.deconstruct(query);

            if (!deconstructed.success) {
                // Complete operation with failure
                if (this.appleOverseer && this.currentOperationId) {
                    this.appleOverseer.completeOperation(this.currentOperationId, {
                        success: false,
                        errors: [deconstructed.reason]
                    });
                }

                return {
                    success: false,
                    reason: deconstructed.reason,
                    useDirectApproach: true
                };
            }

            // Rebuild the plan
            const rebuilt = this.rebuild(deconstructed);
            const duration = Date.now() - startTime;

            // Perform quality check
            const qualityMetrics = this.performQualityCheck(deconstructed, rebuilt, duration);

            // Complete operation with success
            if (this.appleOverseer && this.currentOperationId) {
                this.appleOverseer.completeOperation(this.currentOperationId, {
                    success: true,
                    data: {
                        componentsIdentified: deconstructed.components.length,
                        stepsGenerated: rebuilt.executionPlan.totalSteps,
                        duration: duration,
                        quality: qualityMetrics
                    }
                });
            }

            return {
                success: true,
                deconstruction: deconstructed,
                plan: rebuilt.executionPlan,
                summary: rebuilt.summary,
                qualityMetrics: qualityMetrics,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            // Complete operation with error
            if (this.appleOverseer && this.currentOperationId) {
                this.appleOverseer.completeOperation(this.currentOperationId, {
                    success: false,
                    errors: [error.message]
                });
            }
            throw error;
        }
    }

    /**
     * Perform quality check on deconstruction and rebuild
     */
    performQualityCheck(deconstructed, rebuilt, duration) {
        const metrics = {
            componentCoverage: 0,
            stepClarity: 0,
            dependencyResolution: 0,
            performanceScore: 0,
            overallScore: 0
        };

        // Component coverage: Did we identify meaningful components?
        const minComponents = 2;
        const maxComponents = 15;
        const componentCount = deconstructed.components.length;
        if (componentCount >= minComponents && componentCount <= maxComponents) {
            metrics.componentCoverage = 1.0;
        } else if (componentCount < minComponents) {
            metrics.componentCoverage = componentCount / minComponents;
        } else {
            metrics.componentCoverage = maxComponents / componentCount;
        }

        // Step clarity: Are steps well-defined?
        const stepsWithResources = rebuilt.executionPlan.steps.filter(s => s.requiredResources.length > 0).length;
        metrics.stepClarity = Math.min(1.0, (stepsWithResources / rebuilt.executionPlan.steps.length) + 0.5);

        // Dependency resolution: Are dependencies properly identified?
        const totalDeps = rebuilt.executionPlan.steps.reduce((sum, s) => sum + s.dependencies.length, 0);
        metrics.dependencyResolution = Math.min(1.0, totalDeps / rebuilt.executionPlan.steps.length);

        // Performance: Was the operation fast enough?
        const expectedDuration = 1000; // 1 second
        metrics.performanceScore = duration <= expectedDuration ? 1.0 : expectedDuration / duration;

        // Overall score
        metrics.overallScore = (
            metrics.componentCoverage * 0.3 +
            metrics.stepClarity * 0.3 +
            metrics.dependencyResolution * 0.2 +
            metrics.performanceScore * 0.2
        );

        metrics.rating = this.getRatingFromScore(metrics.overallScore);
        metrics.duration = duration;

        return metrics;
    }

    /**
     * Get rating from score
     */
    getRatingFromScore(score) {
        if (score >= 0.9) return 'excellent';
        if (score >= 0.75) return 'good';
        if (score >= 0.6) return 'fair';
        return 'poor';
    }

    /**
     * Split query into sentences
     */
    splitIntoSentences(query) {
        // Split on sentence boundaries, preserving the delimiter
        const sentences = query.split(/([.!?]+\s+|\n+)/);

        // Recombine and clean
        const result = [];
        let current = '';

        for (const part of sentences) {
            if (part.match(/^[.!?]+\s+$/)) {
                if (current.trim()) {
                    result.push(current.trim());
                }
                current = '';
            } else {
                current += part;
            }
        }

        if (current.trim()) {
            result.push(current.trim());
        }

        // Also split on commas and semicolons for detailed analysis
        const detailed = [];
        result.forEach(sentence => {
            const clauses = sentence.split(/[,;]+/).map(c => c.trim()).filter(c => c);
            detailed.push(...clauses);
        });

        return detailed;
    }

    /**
     * Analyze a sentence to determine its component type
     */
    analyzeSentence(sentence, index) {
        const actionVerbs = /\b(show|display|find|get|create|update|delete|calculate|analyze|check|verify|list|search|filter|sort)\b/gi;
        const conditionalWords = /\b(if|when|while|unless|until|after|before)\b/gi;
        const dataWords = /\b(data|information|record|entry|item|list|report|details)\b/gi;
        const resourceWords = /\b(tool|system|api|database|service|file|document)\b/gi;
        const constraintWords = /\b(only|must|should|required|need|without|except|limit)\b/gi;
        const goalWords = /\b(so that|in order to|to|for|goal|purpose|objective)\b/gi;
        const sequenceWords = /\b(first|second|then|next|finally|after|before)\b/gi;

        let type = this.componentTypes.ACTION; // default
        let priority = 1;

        if (sentence.match(conditionalWords)) {
            type = this.componentTypes.CONDITION;
            priority = 2;
        } else if (sentence.match(goalWords)) {
            type = this.componentTypes.GOAL;
            priority = 3;
        } else if (sentence.match(sequenceWords)) {
            type = this.componentTypes.SEQUENCE;
            priority = 1;
        } else if (sentence.match(constraintWords)) {
            type = this.componentTypes.CONSTRAINT;
            priority = 2;
        } else if (sentence.match(resourceWords)) {
            type = this.componentTypes.RESOURCE;
            priority = 2;
        } else if (sentence.match(dataWords)) {
            type = this.componentTypes.DATA;
            priority = 1;
        }

        return {
            id: `component_${index}`,
            index: index,
            type: type,
            content: sentence,
            priority: priority,
            keywords: this.extractKeywords(sentence),
            entities: this.extractEntities(sentence)
        };
    }

    /**
     * Extract keywords from sentence
     */
    extractKeywords(sentence) {
        // Remove common words and extract important terms
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were'];
        const words = sentence.toLowerCase().split(/\s+/);
        return words.filter(word => !stopWords.includes(word) && word.length > 2);
    }

    /**
     * Extract entities (tool names, resources, etc.)
     */
    extractEntities(sentence) {
        const entities = [];

        // Tool names
        const tools = ['inventory', 'scheduler', 'grading', 'tools', 'checkout'];
        tools.forEach(tool => {
            if (sentence.toLowerCase().includes(tool)) {
                entities.push({ type: 'tool', value: tool });
            }
        });

        // Numbers
        const numbers = sentence.match(/\b\d+\b/g);
        if (numbers) {
            numbers.forEach(num => {
                entities.push({ type: 'number', value: num });
            });
        }

        // Dates (simple patterns)
        const dates = sentence.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g);
        if (dates) {
            dates.forEach(date => {
                entities.push({ type: 'date', value: date });
            });
        }

        return entities;
    }

    /**
     * Find relationship between two components
     */
    findRelationship(comp1, comp2) {
        // Check for dependencies based on keywords and types
        const commonKeywords = comp1.keywords.filter(k => comp2.keywords.includes(k));

        if (commonKeywords.length > 0) {
            return {
                from: comp1.id,
                to: comp2.id,
                type: 'related',
                strength: commonKeywords.length,
                commonKeywords: commonKeywords
            };
        }

        // Type-based relationships
        if (comp1.type === this.componentTypes.CONDITION && comp2.type === this.componentTypes.ACTION) {
            return {
                from: comp1.id,
                to: comp2.id,
                type: 'prerequisite',
                strength: 3
            };
        }

        if (comp1.type === this.componentTypes.RESOURCE && comp2.type === this.componentTypes.ACTION) {
            return {
                from: comp1.id,
                to: comp2.id,
                type: 'requires',
                strength: 2
            };
        }

        return null;
    }

    /**
     * Build dependency graph
     */
    buildDependencyGraph(components, relationships) {
        const graph = {};

        components.forEach(comp => {
            graph[comp.id] = {
                component: comp,
                dependencies: [],
                dependents: []
            };
        });

        relationships.forEach(rel => {
            if (graph[rel.from] && graph[rel.to]) {
                graph[rel.to].dependencies.push(rel.from);
                graph[rel.from].dependents.push(rel.to);
            }
        });

        return graph;
    }

    /**
     * Topological sort for execution order
     */
    topologicalSort(components, graph) {
        const visited = new Set();
        const sorted = [];

        const visit = (compId) => {
            if (visited.has(compId)) return;
            visited.add(compId);

            const node = graph[compId];
            if (node && node.dependencies) {
                node.dependencies.forEach(depId => visit(depId));
            }

            const component = components.find(c => c.id === compId);
            if (component) {
                sorted.push(component);
            }
        };

        components.forEach(comp => visit(comp.id));
        return sorted;
    }

    /**
     * Generate step description
     */
    generateStepDescription(component) {
        const typeDescriptions = {
            [this.componentTypes.ACTION]: 'Execute',
            [this.componentTypes.CONDITION]: 'Check if',
            [this.componentTypes.DATA]: 'Retrieve',
            [this.componentTypes.RESOURCE]: 'Prepare',
            [this.componentTypes.CONSTRAINT]: 'Ensure',
            [this.componentTypes.GOAL]: 'Achieve',
            [this.componentTypes.SEQUENCE]: 'Perform'
        };

        const prefix = typeDescriptions[component.type] || 'Process';
        return `${prefix}: ${component.content}`;
    }

    /**
     * Get component dependencies
     */
    getComponentDependencies(component, graph) {
        const node = graph[component.id];
        return node ? node.dependencies : [];
    }

    /**
     * Estimate complexity of a component
     */
    estimateComplexity(component) {
        let complexity = 1;

        complexity += component.keywords.length * 0.1;
        complexity += component.entities.length * 0.2;

        if (component.type === this.componentTypes.CONDITION) complexity += 1;
        if (component.type === this.componentTypes.GOAL) complexity += 0.5;

        return Math.round(complexity * 10) / 10;
    }

    /**
     * Identify required resources for a component
     */
    identifyResources(component) {
        const resources = [];

        component.entities.forEach(entity => {
            if (entity.type === 'tool') {
                resources.push({ type: 'tool', name: entity.value });
            }
        });

        return resources;
    }

    /**
     * Identify potential issues
     */
    identifyPotentialIssues(component) {
        const issues = [];

        if (component.entities.length === 0 && component.type === this.componentTypes.ACTION) {
            issues.push('No specific entities identified - may need clarification');
        }

        if (component.keywords.length > 10) {
            issues.push('High complexity - consider breaking down further');
        }

        return issues;
    }

    /**
     * Estimate total duration
     */
    estimateTotalDuration(steps) {
        const totalComplexity = steps.reduce((sum, step) => sum + step.estimatedComplexity, 0);
        return `${Math.ceil(totalComplexity * 30)} seconds`;
    }

    /**
     * Identify critical path
     */
    identifyCriticalPath(steps, graph) {
        // Simplified critical path - steps with most dependencies
        return steps
            .filter(step => step.dependencies.length > 0)
            .sort((a, b) => b.dependencies.length - a.dependencies.length)
            .slice(0, 3)
            .map(step => step.id);
    }

    /**
     * Identify steps that can be done in parallel
     */
    identifyParallelSteps(steps, graph) {
        const parallel = [];
        const groups = {};

        steps.forEach(step => {
            const depCount = step.dependencies.length;
            if (!groups[depCount]) {
                groups[depCount] = [];
            }
            groups[depCount].push(step.id);
        });

        Object.keys(groups).forEach(key => {
            if (groups[key].length > 1) {
                parallel.push(groups[key]);
            }
        });

        return parallel;
    }

    /**
     * Generate summary
     */
    generateSummary(executionPlan) {
        return {
            overview: `This task has been broken down into ${executionPlan.totalSteps} actionable steps.`,
            duration: `Estimated completion time: ${executionPlan.estimatedDuration}`,
            complexity: `Critical path contains ${executionPlan.criticalPath.length} key steps.`,
            parallelization: executionPlan.parallelizable.length > 0
                ? `${executionPlan.parallelizable.length} groups of steps can be executed in parallel.`
                : 'Steps must be executed sequentially.'
        };
    }

    /**
     * Add to history
     */
    addToHistory(entry) {
        this.history.push(entry);
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * Get history
     */
    getHistory() {
        return this.history;
    }

    /**
     * Clear history
     */
    clearHistory() {
        this.history = [];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeconstructionRebuildSkill;
}
