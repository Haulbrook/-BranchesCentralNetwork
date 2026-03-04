/**
 * Forward Thinker Skill
 * Anticipates future needs, predicts next steps, and provides proactive suggestions
 */
class ForwardThinkerSkill {
    constructor(config = {}) {
        this.config = config;
        this.enabled = config.enableForwardThinkerSkill !== false;
        this.contextHistory = [];
        this.predictions = [];
        this.maxHistorySize = 100;

        // Apple Overseer integration
        this.appleOverseer = null;
        this.currentOperationId = null;

        // Pattern library for predicting next actions
        this.actionPatterns = {
            search: {
                nextSteps: ['filter', 'sort', 'export', 'analyze'],
                questions: ['Do you want to refine the search?', 'Would you like to filter the results?'],
                suggestions: ['Consider filtering by date', 'Sort results by relevance']
            },
            create: {
                nextSteps: ['verify', 'test', 'share', 'backup'],
                questions: ['Would you like to verify the creation?', 'Should we back this up?'],
                suggestions: ['Test the new item', 'Create a backup copy']
            },
            update: {
                nextSteps: ['verify', 'notify', 'log', 'backup'],
                questions: ['Should we notify affected parties?', 'Would you like to log this change?'],
                suggestions: ['Verify the update was successful', 'Create a change log entry']
            },
            delete: {
                nextSteps: ['backup', 'verify', 'clean', 'notify'],
                questions: ['Did you create a backup?', 'Should we clean up related items?'],
                suggestions: ['Backup before deletion', 'Check for dependent items']
            },
            analyze: {
                nextSteps: ['report', 'visualize', 'export', 'share'],
                questions: ['Would you like a detailed report?', 'Should we visualize the data?'],
                suggestions: ['Generate a summary report', 'Create charts for visualization']
            },
            schedule: {
                nextSteps: ['notify', 'prepare', 'verify', 'optimize'],
                questions: ['Should we send reminders?', 'Would you like to optimize the schedule?'],
                suggestions: ['Set up automated reminders', 'Check for scheduling conflicts']
            }
        };

        // Consequence prediction patterns
        this.consequencePatterns = [
            {
                condition: (action) => action.includes('delete') || action.includes('remove'),
                consequences: ['Data loss', 'Broken references', 'Need for restoration'],
                severity: 'high',
                mitigations: ['Create backup', 'Verify no dependencies', 'Test restore procedure']
            },
            {
                condition: (action) => action.includes('update') || action.includes('change'),
                consequences: ['Data inconsistency', 'Need for notification', 'Audit trail required'],
                severity: 'medium',
                mitigations: ['Version control', 'Change log', 'Notify stakeholders']
            },
            {
                condition: (action) => action.includes('schedule') || action.includes('assign'),
                consequences: ['Resource conflicts', 'Overallocation', 'Timeline changes'],
                severity: 'medium',
                mitigations: ['Check availability', 'Verify capacity', 'Buffer time']
            },
            {
                condition: (action) => action.includes('inventory') || action.includes('stock'),
                consequences: ['Stock shortages', 'Overstocking', 'Cost implications'],
                severity: 'medium',
                mitigations: ['Check current levels', 'Verify reorder points', 'Review trends']
            }
        ];

        // Optimization suggestions
        this.optimizationPatterns = {
            repetitive: {
                indicator: 'Same action performed multiple times',
                suggestion: 'Consider batch processing or automation',
                impact: 'high'
            },
            sequential: {
                indicator: 'Actions performed one after another',
                suggestion: 'Some steps might be parallelizable',
                impact: 'medium'
            },
            manual: {
                indicator: 'Manual data entry or processing',
                suggestion: 'Consider API integration or automation',
                impact: 'high'
            },
            timing: {
                indicator: 'Time-sensitive operations',
                suggestion: 'Schedule during optimal hours',
                impact: 'low'
            }
        };
    }

    /**
     * Connect to Apple Overseer for operation coordination
     */
    connectOverseer(overseer) {
        this.appleOverseer = overseer;
        console.log('✅ ForwardThinkerSkill connected to Apple Overseer');
    }

    /**
     * Analyze action and predict next steps
     */
    predictNextSteps(action, context = {}) {
        if (!this.enabled) {
            return { enabled: false };
        }

        // Register operation with Apple Overseer
        if (this.appleOverseer) {
            this.currentOperationId = `forward_${Date.now()}`;
            const registration = this.appleOverseer.registerOperation(this.currentOperationId, {
                tool: 'ForwardThinkerSkill',
                action: 'predict',
                user: 'system',
                priority: 'normal',
                resource: 'prediction_engine',
                details: {
                    actionLength: action.length,
                    hasContext: Object.keys(context).length > 0
                }
            });

            // Check if operation was blocked
            if (!registration.success && registration.blocked) {
                console.warn('🍎 Forward prediction blocked by overseer:', registration.reason);
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

            const actionType = this.classifyAction(action);
            const pattern = this.actionPatterns[actionType];

            if (!pattern) {
                // Complete operation with failure
                if (this.appleOverseer && this.currentOperationId) {
                    this.appleOverseer.completeOperation(this.currentOperationId, {
                        success: false,
                        errors: ['No prediction pattern found for this action type']
                    });
                }

                return {
                    success: false,
                    reason: 'No prediction pattern found for this action type'
                };
            }

            // Generate predictions based on pattern and context
            const predictions = {
                actionType: actionType,
                nextSteps: this.rankNextSteps(pattern.nextSteps, context),
                questions: pattern.questions,
                suggestions: this.contextualSuggestions(pattern.suggestions, context),
                consequences: this.predictConsequences(action),
                optimizations: this.identifyOptimizations(action, context),
                timestamp: new Date().toISOString()
            };

            const duration = Date.now() - startTime;

            // Perform quality check
            const qualityMetrics = this.performQualityCheck(predictions, duration);

            // Store in context history
            this.addToContext({
                action: action,
                predictions: predictions,
                context: context,
                quality: qualityMetrics,
                timestamp: new Date().toISOString()
            });

            // Complete operation with success
            if (this.appleOverseer && this.currentOperationId) {
                this.appleOverseer.completeOperation(this.currentOperationId, {
                    success: true,
                    data: {
                        actionType: actionType,
                        predictionsGenerated: predictions.nextSteps.length,
                        optimizationsFound: predictions.optimizations.length,
                        duration: duration,
                        quality: qualityMetrics
                    }
                });
            }

            return {
                success: true,
                predictions: predictions,
                qualityMetrics: qualityMetrics
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
     * Perform quality check on predictions
     */
    performQualityCheck(predictions, duration) {
        const metrics = {
            predictionCoverage: 0,
            suggestionRelevance: 0,
            consequenceDepth: 0,
            performanceScore: 0,
            overallScore: 0
        };

        // Prediction coverage: Did we generate useful next steps?
        const minPredictions = 2;
        const maxPredictions = 10;
        const predictionCount = predictions.nextSteps.length;
        if (predictionCount >= minPredictions && predictionCount <= maxPredictions) {
            metrics.predictionCoverage = 1.0;
        } else if (predictionCount < minPredictions) {
            metrics.predictionCoverage = predictionCount / minPredictions;
        } else {
            metrics.predictionCoverage = maxPredictions / predictionCount;
        }

        // Suggestion relevance: Are suggestions contextual?
        metrics.suggestionRelevance = Math.min(1.0, predictions.suggestions.length / 3);

        // Consequence depth: Did we identify consequences?
        metrics.consequenceDepth = Math.min(1.0, predictions.consequences.length / 2);

        // Performance: Was the prediction fast enough?
        const expectedDuration = 500; // 500ms
        metrics.performanceScore = duration <= expectedDuration ? 1.0 : expectedDuration / duration;

        // Overall score
        metrics.overallScore = (
            metrics.predictionCoverage * 0.3 +
            metrics.suggestionRelevance * 0.3 +
            metrics.consequenceDepth * 0.2 +
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
     * Classify action type
     */
    classifyAction(action) {
        const actionLower = action.toLowerCase();

        const classifiers = [
            { type: 'search', keywords: ['search', 'find', 'look', 'query', 'lookup'] },
            { type: 'create', keywords: ['create', 'add', 'new', 'insert', 'make'] },
            { type: 'update', keywords: ['update', 'modify', 'change', 'edit', 'alter'] },
            { type: 'delete', keywords: ['delete', 'remove', 'clear', 'erase', 'drop'] },
            { type: 'analyze', keywords: ['analyze', 'examine', 'inspect', 'review', 'assess'] },
            { type: 'schedule', keywords: ['schedule', 'plan', 'arrange', 'organize', 'assign'] }
        ];

        for (const classifier of classifiers) {
            for (const keyword of classifier.keywords) {
                if (actionLower.includes(keyword)) {
                    return classifier.type;
                }
            }
        }

        return 'search'; // default
    }

    /**
     * Rank next steps by relevance
     */
    rankNextSteps(steps, context) {
        const ranked = steps.map(step => {
            let score = 1;

            // Increase score based on context
            if (context.hasResults) {
                if (step === 'filter' || step === 'sort') score += 2;
            }

            if (context.isModification) {
                if (step === 'verify' || step === 'backup') score += 3;
            }

            if (context.requiresNotification) {
                if (step === 'notify' || step === 'share') score += 2;
            }

            return { step, score };
        });

        return ranked.sort((a, b) => b.score - a.score).map(r => r.step);
    }

    /**
     * Generate contextual suggestions
     */
    contextualSuggestions(baseSuggestions, context) {
        const suggestions = [...baseSuggestions];

        // Add context-specific suggestions
        if (context.timeSensitive) {
            suggestions.push('Set up automated reminders for time-sensitive items');
        }

        if (context.multipleUsers) {
            suggestions.push('Consider user permissions and access control');
        }

        if (context.largeDataset) {
            suggestions.push('Use pagination or filtering for better performance');
        }

        if (context.frequentAccess) {
            suggestions.push('Consider adding this to favorites or quick access');
        }

        return suggestions;
    }

    /**
     * Predict consequences of an action
     */
    predictConsequences(action) {
        const predictions = [];

        for (const pattern of this.consequencePatterns) {
            if (pattern.condition(action.toLowerCase())) {
                predictions.push({
                    consequences: pattern.consequences,
                    severity: pattern.severity,
                    mitigations: pattern.mitigations,
                    priority: this.calculatePriority(pattern.severity)
                });
            }
        }

        return predictions.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Calculate priority based on severity
     */
    calculatePriority(severity) {
        const priorities = { high: 3, medium: 2, low: 1 };
        return priorities[severity] || 1;
    }

    /**
     * Identify optimization opportunities
     */
    identifyOptimizations(action, context) {
        const optimizations = [];

        // Check for repetitive actions
        const recentActions = this.getRecentActions(5);
        const repetitive = this.countRepetitive(action, recentActions);

        if (repetitive >= 3) {
            optimizations.push({
                type: 'repetitive',
                indicator: this.optimizationPatterns.repetitive.indicator,
                suggestion: this.optimizationPatterns.repetitive.suggestion,
                impact: this.optimizationPatterns.repetitive.impact,
                details: `This action has been performed ${repetitive} times recently`
            });
        }

        // Check for sequential patterns
        if (recentActions.length >= 2) {
            const sequential = this.detectSequentialPattern(recentActions);
            if (sequential) {
                optimizations.push({
                    type: 'sequential',
                    indicator: this.optimizationPatterns.sequential.indicator,
                    suggestion: this.optimizationPatterns.sequential.suggestion,
                    impact: this.optimizationPatterns.sequential.impact,
                    details: `Detected sequential pattern: ${sequential.join(' → ')}`
                });
            }
        }

        // Check for manual processing
        if (context.manualEntry) {
            optimizations.push({
                type: 'manual',
                indicator: this.optimizationPatterns.manual.indicator,
                suggestion: this.optimizationPatterns.manual.suggestion,
                impact: this.optimizationPatterns.manual.impact,
                details: 'Manual data entry detected'
            });
        }

        // Check for timing optimizations
        if (context.currentTime) {
            const timeOpt = this.analyzeTimingOptimization(context.currentTime);
            if (timeOpt) {
                optimizations.push(timeOpt);
            }
        }

        return optimizations;
    }

    /**
     * Count repetitive actions
     */
    countRepetitive(action, recentActions) {
        const actionType = this.classifyAction(action);
        return recentActions.filter(a => this.classifyAction(a) === actionType).length;
    }

    /**
     * Detect sequential patterns
     */
    detectSequentialPattern(actions) {
        if (actions.length < 2) return null;

        const types = actions.map(a => this.classifyAction(a));
        const unique = [...new Set(types)];

        // If all actions are different and follow a logical sequence
        if (unique.length === types.length) {
            return types;
        }

        return null;
    }

    /**
     * Analyze timing optimization
     */
    analyzeTimingOptimization(currentTime) {
        const hour = new Date(currentTime).getHours();

        // Peak hours: 9-11 AM, 2-4 PM
        const isPeakHour = (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16);

        // Off-peak hours: before 8 AM, after 6 PM
        const isOffPeak = hour < 8 || hour > 18;

        if (isPeakHour) {
            return {
                type: 'timing',
                indicator: 'Operation during peak hours',
                suggestion: 'Consider scheduling resource-intensive tasks during off-peak hours',
                impact: this.optimizationPatterns.timing.impact,
                details: 'Current time is during peak usage hours'
            };
        }

        return null;
    }

    /**
     * Get recent actions from context history
     */
    getRecentActions(count = 10) {
        return this.contextHistory
            .slice(-count)
            .map(entry => entry.action);
    }

    /**
     * Anticipate resource needs
     */
    anticipateResources(action, context = {}) {
        if (!this.enabled) {
            return { enabled: false };
        }

        const resources = {
            tools: [],
            data: [],
            people: [],
            time: null,
            cost: null
        };

        const actionType = this.classifyAction(action);

        // Tool requirements
        switch (actionType) {
            case 'search':
            case 'analyze':
                resources.tools.push('Search interface', 'Data access');
                break;
            case 'create':
            case 'update':
                resources.tools.push('Edit interface', 'Validation system');
                break;
            case 'schedule':
                resources.tools.push('Calendar', 'Notification system');
                break;
        }

        // Data requirements
        if (action.toLowerCase().includes('inventory')) {
            resources.data.push('Inventory database', 'Stock levels', 'Location data');
        }

        if (action.toLowerCase().includes('schedule') || action.toLowerCase().includes('crew')) {
            resources.data.push('Employee availability', 'Task list', 'Equipment status');
        }

        // People requirements
        if (context.requiresApproval) {
            resources.people.push('Manager approval');
        }

        if (context.collaborative) {
            resources.people.push('Team collaboration');
        }

        // Time estimation
        resources.time = this.estimateTime(actionType, context);

        // Cost estimation (if applicable)
        if (context.hasCostImplication) {
            resources.cost = this.estimateCost(actionType, context);
        }

        return {
            success: true,
            resources: resources,
            recommendations: this.generateResourceRecommendations(resources)
        };
    }

    /**
     * Estimate time for action
     */
    estimateTime(actionType, context) {
        const baseTime = {
            search: 30,
            create: 120,
            update: 90,
            delete: 60,
            analyze: 180,
            schedule: 150
        };

        let time = baseTime[actionType] || 60;

        // Adjust based on context
        if (context.largeDataset) time *= 2;
        if (context.requiresApproval) time += 300; // 5 minutes for approval
        if (context.complex) time *= 1.5;

        return `${Math.ceil(time / 60)} minutes`;
    }

    /**
     * Estimate cost (simplified)
     */
    estimateCost(actionType, context) {
        // This is a placeholder - real implementation would use actual cost data
        return 'Cost estimation available with full configuration';
    }

    /**
     * Generate resource recommendations
     */
    generateResourceRecommendations(resources) {
        const recommendations = [];

        if (resources.tools.length > 3) {
            recommendations.push('Consider streamlining tool usage');
        }

        if (resources.data.length > 2) {
            recommendations.push('Ensure all data sources are accessible and up-to-date');
        }

        if (resources.people.length > 0) {
            recommendations.push('Notify required personnel in advance');
        }

        return recommendations;
    }

    /**
     * Learn from outcomes (feedback loop)
     */
    learnFromOutcome(action, prediction, actualOutcome) {
        if (!this.enabled) return;

        const learning = {
            action: action,
            prediction: prediction,
            actualOutcome: actualOutcome,
            accuracy: this.calculateAccuracy(prediction, actualOutcome),
            timestamp: new Date().toISOString()
        };

        this.predictions.push(learning);

        // Adjust weights based on accuracy (future enhancement)
        if (learning.accuracy < 0.5) {
            console.log('Low accuracy prediction - consider adjusting patterns');
        }

        return learning;
    }

    /**
     * Calculate prediction accuracy
     */
    calculateAccuracy(prediction, actual) {
        // Simplified accuracy calculation
        // In a real implementation, this would compare predicted vs actual steps
        return 0.75; // Placeholder
    }

    /**
     * Generate proactive suggestions for current context
     */
    generateProactiveSuggestions(currentState = {}) {
        if (!this.enabled) {
            return { enabled: false };
        }

        const suggestions = [];

        // Based on time of day
        const hour = new Date().getHours();
        if (hour >= 8 && hour <= 10) {
            suggestions.push({
                type: 'timing',
                title: 'Morning planning',
                description: 'Review today\'s schedule and upcoming tasks',
                priority: 'medium'
            });
        }

        // Based on recent activity patterns
        const recentActions = this.getRecentActions(10);
        if (recentActions.length > 5) {
            const mostCommon = this.findMostCommonAction(recentActions);
            suggestions.push({
                type: 'efficiency',
                title: 'Workflow optimization',
                description: `You frequently perform "${mostCommon}" actions. Consider creating a shortcut or template.`,
                priority: 'low'
            });
        }

        // Based on system state
        if (currentState.lowInventory) {
            suggestions.push({
                type: 'alert',
                title: 'Low inventory alert',
                description: 'Some items are running low. Review and place orders if needed.',
                priority: 'high'
            });
        }

        if (currentState.upcomingDeadlines) {
            suggestions.push({
                type: 'reminder',
                title: 'Upcoming deadlines',
                description: 'You have tasks due soon. Review priorities.',
                priority: 'high'
            });
        }

        return {
            success: true,
            suggestions: suggestions.sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority))
        };
    }

    /**
     * Find most common action
     */
    findMostCommonAction(actions) {
        const counts = {};
        let maxCount = 0;
        let mostCommon = '';

        actions.forEach(action => {
            const type = this.classifyAction(action);
            counts[type] = (counts[type] || 0) + 1;
            if (counts[type] > maxCount) {
                maxCount = counts[type];
                mostCommon = type;
            }
        });

        return mostCommon;
    }

    /**
     * Priority weight for sorting
     */
    priorityWeight(priority) {
        const weights = { high: 3, medium: 2, low: 1 };
        return weights[priority] || 1;
    }

    /**
     * Add to context history
     */
    addToContext(entry) {
        this.contextHistory.push(entry);
        if (this.contextHistory.length > this.maxHistorySize) {
            this.contextHistory.shift();
        }
    }

    /**
     * Get context history
     */
    getContextHistory() {
        return this.contextHistory;
    }

    /**
     * Clear context history
     */
    clearContextHistory() {
        this.contextHistory = [];
        this.predictions = [];
    }

    /**
     * Get statistics
     */
    getStatistics() {
        return {
            totalPredictions: this.predictions.length,
            averageAccuracy: this.predictions.length > 0
                ? this.predictions.reduce((sum, p) => sum + p.accuracy, 0) / this.predictions.length
                : 0,
            contextHistorySize: this.contextHistory.length,
            mostCommonAction: this.findMostCommonAction(this.getRecentActions(100))
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ForwardThinkerSkill;
}
