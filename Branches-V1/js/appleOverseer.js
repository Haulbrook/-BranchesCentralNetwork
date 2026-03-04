/**
 * Apple Overseer Manager
 * Oversees and coordinates multiple tools/operations while providing quality control and validation
 */
class AppleOverseer {
    constructor(config = {}) {
        this.config = config;
        this.enabled = config.enableAppleOverseer !== false;

        // Operation tracking
        this.activeOperations = new Map();
        this.operationHistory = [];
        this.maxHistorySize = 50;

        // Quality metrics
        this.qualityThresholds = {
            warningLevel: 0.7,
            criticalLevel: 0.9,
            maxConcurrentOps: 5
        };

        // Tool coordination state
        this.toolStates = new Map();
        this.toolDependencies = new Map();

        // Validation rules
        this.validationRules = this.initializeValidationRules();

        // Status tracking
        this.status = {
            health: 'healthy', // healthy, warning, critical
            activeToolCount: 0,
            operationCount: 0,
            lastCheck: Date.now(),
            alerts: []
        };

        console.log('🍎 Apple Overseer initialized');
    }

    /**
     * Initialize validation rules for quality control
     */
    initializeValidationRules() {
        return {
            // Tool usage validation
            toolUsage: {
                maxConcurrentTools: 3,
                requiredCooldown: 1000, // ms between rapid tool switches
                blockSimultaneousConflicts: true
            },

            // Operation validation
            operations: {
                maxDuration: 300000, // 5 minutes
                requireConfirmationForCritical: true,
                validateInputs: true
            },

            // Quality checks
            quality: {
                checkDataIntegrity: true,
                validateOutputs: true,
                monitorPerformance: true
            }
        };
    }

    /**
     * Register a new operation for oversight
     */
    registerOperation(operationId, details) {
        if (!this.enabled) return { success: true };

        const operation = {
            id: operationId,
            ...details,
            startTime: Date.now(),
            status: 'active',
            tool: details.tool || 'unknown',
            user: details.user || 'system',
            priority: details.priority || 'normal'
        };

        // Validate operation before registration
        const validation = this.validateOperation(operation);
        if (!validation.valid) {
            console.warn('🍎 Operation validation failed:', validation.reason);
            return {
                success: false,
                blocked: true,
                reason: validation.reason,
                recommendations: validation.recommendations
            };
        }

        this.activeOperations.set(operationId, operation);
        this.updateStatus();

        console.log(`🍎 Operation registered: ${operationId}`, operation);

        return {
            success: true,
            operationId,
            estimatedDuration: this.estimateOperationDuration(operation)
        };
    }

    /**
     * Validate an operation before execution
     */
    validateOperation(operation) {
        const checks = [];

        // Check concurrent operations
        if (this.activeOperations.size >= this.validationRules.toolUsage.maxConcurrentTools) {
            return {
                valid: false,
                reason: 'Too many concurrent operations',
                recommendations: ['Wait for current operations to complete', 'Cancel non-critical operations']
            };
        }

        // Check for conflicting operations
        const conflicts = this.checkOperationConflicts(operation);
        if (conflicts.length > 0) {
            return {
                valid: false,
                reason: `Conflicts with: ${conflicts.join(', ')}`,
                recommendations: ['Wait for conflicting operations to complete', 'Modify operation parameters']
            };
        }

        // Check tool availability
        if (operation.tool) {
            const toolState = this.toolStates.get(operation.tool);
            if (toolState && toolState.status === 'busy') {
                return {
                    valid: false,
                    reason: `Tool "${operation.tool}" is currently busy`,
                    recommendations: ['Wait for tool to become available', 'Use alternative tool']
                };
            }
        }

        // Check for rapid tool switching
        const rapidSwitching = this.detectRapidToolSwitching(operation);
        if (rapidSwitching) {
            return {
                valid: false,
                reason: 'Rapid tool switching detected - please allow time between operations',
                recommendations: ['Wait a moment before switching tools', 'Complete current task first']
            };
        }

        return { valid: true };
    }

    /**
     * Check for conflicting operations
     */
    checkOperationConflicts(newOperation) {
        const conflicts = [];

        for (const [id, op] of this.activeOperations) {
            // Same tool, incompatible actions
            if (op.tool === newOperation.tool && op.action !== newOperation.action) {
                if (this.areActionsIncompatible(op.action, newOperation.action)) {
                    conflicts.push(id);
                }
            }

            // Resource conflicts
            if (op.resource && newOperation.resource && op.resource === newOperation.resource) {
                conflicts.push(id);
            }
        }

        return conflicts;
    }

    /**
     * Check if two actions are incompatible
     */
    areActionsIncompatible(action1, action2) {
        const incompatiblePairs = [
            ['create', 'delete'],
            ['edit', 'delete'],
            ['lock', 'modify']
        ];

        return incompatiblePairs.some(pair =>
            (pair.includes(action1) && pair.includes(action2))
        );
    }

    /**
     * Detect rapid tool switching
     */
    detectRapidToolSwitching(operation) {
        const recentOps = this.operationHistory.slice(-3);
        if (recentOps.length < 2) return false;

        const lastOp = recentOps[recentOps.length - 1];
        const timeSinceLastOp = Date.now() - lastOp.endTime;

        return timeSinceLastOp < this.validationRules.toolUsage.requiredCooldown &&
               lastOp.tool !== operation.tool;
    }

    /**
     * Update operation status
     */
    updateOperation(operationId, updates) {
        if (!this.activeOperations.has(operationId)) {
            console.warn(`🍎 Operation ${operationId} not found`);
            return { success: false };
        }

        const operation = this.activeOperations.get(operationId);
        Object.assign(operation, updates);

        // Check for quality issues
        if (updates.status === 'completed') {
            this.performQualityCheck(operation);
        }

        this.updateStatus();
        return { success: true };
    }

    /**
     * Complete an operation
     */
    completeOperation(operationId, result = {}) {
        if (!this.activeOperations.has(operationId)) {
            return { success: false };
        }

        const operation = this.activeOperations.get(operationId);
        operation.endTime = Date.now();
        operation.duration = operation.endTime - operation.startTime;
        operation.status = result.success ? 'completed' : 'failed';
        operation.result = result;

        // Perform quality check
        const qualityCheck = this.performQualityCheck(operation);

        // Move to history
        this.operationHistory.push(operation);
        if (this.operationHistory.length > this.maxHistorySize) {
            this.operationHistory.shift();
        }

        // Remove from active operations
        this.activeOperations.delete(operationId);

        this.updateStatus();

        console.log(`🍎 Operation completed: ${operationId}`, {
            duration: operation.duration,
            quality: qualityCheck
        });

        return {
            success: true,
            duration: operation.duration,
            qualityCheck
        };
    }

    /**
     * Perform quality check on completed operation
     */
    performQualityCheck(operation) {
        const checks = {
            duration: this.checkOperationDuration(operation),
            output: this.checkOperationOutput(operation),
            errors: this.checkOperationErrors(operation),
            performance: this.checkOperationPerformance(operation)
        };

        const score = Object.values(checks).filter(c => c.passed).length / Object.keys(checks).length;

        return {
            score,
            passed: score >= 0.75,
            checks,
            rating: this.getRatingFromScore(score)
        };
    }

    /**
     * Check operation duration
     */
    checkOperationDuration(operation) {
        if (!operation.duration) return { passed: true, note: 'No duration data' };

        const expected = this.estimateOperationDuration(operation);
        const withinRange = operation.duration <= expected * 1.5;

        return {
            passed: withinRange,
            expected,
            actual: operation.duration,
            note: withinRange ? 'Within expected duration' : 'Exceeded expected duration'
        };
    }

    /**
     * Check operation output
     */
    checkOperationOutput(operation) {
        if (!operation.result) return { passed: true, note: 'No output to validate' };

        const hasResult = !!operation.result.data;
        const hasErrors = !!operation.result.errors;

        return {
            passed: hasResult && !hasErrors,
            note: hasResult ? 'Output present' : 'No output generated'
        };
    }

    /**
     * Check operation errors
     */
    checkOperationErrors(operation) {
        if (!operation.result) return { passed: true, note: 'No error data' };

        const errorCount = operation.result.errors ? operation.result.errors.length : 0;

        return {
            passed: errorCount === 0,
            errorCount,
            note: errorCount === 0 ? 'No errors' : `${errorCount} error(s) occurred`
        };
    }

    /**
     * Check operation performance
     */
    checkOperationPerformance(operation) {
        // Performance is acceptable if no timeout occurred
        const timedOut = operation.duration >= this.validationRules.operations.maxDuration;

        return {
            passed: !timedOut,
            note: timedOut ? 'Operation timed out' : 'Acceptable performance'
        };
    }

    /**
     * Get rating from quality score
     */
    getRatingFromScore(score) {
        if (score >= 0.9) return 'excellent';
        if (score >= 0.75) return 'good';
        if (score >= 0.6) return 'fair';
        return 'poor';
    }

    /**
     * Estimate operation duration
     */
    estimateOperationDuration(operation) {
        // Simple estimation based on operation type
        const baseDurations = {
            query: 2000,
            create: 3000,
            update: 2500,
            delete: 1500,
            search: 3000,
            analyze: 5000
        };

        return baseDurations[operation.action] || 3000;
    }

    /**
     * Update tool state
     */
    updateToolState(toolId, state) {
        this.toolStates.set(toolId, {
            ...state,
            lastUpdate: Date.now()
        });

        this.updateStatus();
    }

    /**
     * Get current status and health
     */
    getStatus() {
        return {
            ...this.status,
            activeOperations: Array.from(this.activeOperations.values()),
            recentHistory: this.operationHistory.slice(-10),
            toolStates: Array.from(this.toolStates.entries())
        };
    }

    /**
     * Update overall status
     */
    updateStatus() {
        this.status.activeToolCount = this.toolStates.size;
        this.status.operationCount = this.activeOperations.size;
        this.status.lastCheck = Date.now();

        // Determine health status
        const operationLoad = this.activeOperations.size / this.qualityThresholds.maxConcurrentOps;

        if (operationLoad >= this.qualityThresholds.criticalLevel) {
            this.status.health = 'critical';
        } else if (operationLoad >= this.qualityThresholds.warningLevel) {
            this.status.health = 'warning';
        } else {
            this.status.health = 'healthy';
        }

        // Update alerts
        this.updateAlerts();
    }

    /**
     * Update system alerts
     */
    updateAlerts() {
        this.status.alerts = [];

        // Check for long-running operations
        const now = Date.now();
        for (const [id, op] of this.activeOperations) {
            const duration = now - op.startTime;
            if (duration > this.validationRules.operations.maxDuration * 0.8) {
                this.status.alerts.push({
                    type: 'warning',
                    message: `Operation "${id}" is running longer than expected`,
                    operationId: id
                });
            }
        }

        // Check for system overload
        if (this.status.health === 'critical') {
            this.status.alerts.push({
                type: 'critical',
                message: 'System is overloaded - too many concurrent operations'
            });
        }
    }

    /**
     * Coordinate between multiple tools
     */
    coordinateTools(toolIds, action) {
        console.log(`🍎 Coordinating tools: ${toolIds.join(', ')} for action: ${action}`);

        // Check if all tools are available
        const unavailableTools = toolIds.filter(toolId => {
            const state = this.toolStates.get(toolId);
            return state && state.status === 'busy';
        });

        if (unavailableTools.length > 0) {
            return {
                success: false,
                reason: `Tools not available: ${unavailableTools.join(', ')}`,
                recommendations: ['Wait for tools to become available', 'Reduce scope of operation']
            };
        }

        // Set up coordination
        const coordinationId = `coord_${Date.now()}`;
        const coordination = {
            id: coordinationId,
            tools: toolIds,
            action,
            startTime: Date.now(),
            status: 'coordinating'
        };

        return {
            success: true,
            coordinationId,
            coordination
        };
    }

    /**
     * Provide recommendations based on current state
     */
    getRecommendations() {
        const recommendations = [];

        // Based on operation load
        if (this.status.operationCount >= 3) {
            recommendations.push({
                type: 'efficiency',
                message: 'Consider completing current operations before starting new ones',
                priority: 'medium'
            });
        }

        // Based on recent failures
        const recentFailures = this.operationHistory
            .slice(-10)
            .filter(op => op.status === 'failed');

        if (recentFailures.length >= 3) {
            recommendations.push({
                type: 'quality',
                message: 'Multiple recent failures detected - review operation parameters',
                priority: 'high'
            });
        }

        // Based on tool usage patterns
        const toolUsage = this.analyzeToolUsage();
        if (toolUsage.underutilized.length > 0) {
            recommendations.push({
                type: 'optimization',
                message: `Consider using: ${toolUsage.underutilized.join(', ')}`,
                priority: 'low'
            });
        }

        return recommendations;
    }

    /**
     * Analyze tool usage patterns
     */
    analyzeToolUsage() {
        const usage = new Map();

        // Count usage in history
        this.operationHistory.forEach(op => {
            usage.set(op.tool, (usage.get(op.tool) || 0) + 1);
        });

        const sortedUsage = Array.from(usage.entries())
            .sort((a, b) => b[1] - a[1]);

        return {
            mostUsed: sortedUsage.slice(0, 3).map(([tool]) => tool),
            underutilized: sortedUsage.slice(-3).map(([tool]) => tool),
            usage: Object.fromEntries(usage)
        };
    }

    /**
     * Generate oversight report
     */
    generateReport() {
        const totalOps = this.operationHistory.length;
        const successfulOps = this.operationHistory.filter(op => op.status === 'completed').length;
        const successRate = totalOps > 0 ? (successfulOps / totalOps * 100).toFixed(1) : 0;

        const avgDuration = totalOps > 0
            ? this.operationHistory.reduce((sum, op) => sum + (op.duration || 0), 0) / totalOps
            : 0;

        return {
            summary: {
                totalOperations: totalOps,
                successfulOperations: successfulOps,
                failedOperations: totalOps - successfulOps,
                successRate: `${successRate}%`,
                averageDuration: `${avgDuration.toFixed(0)}ms`,
                currentHealth: this.status.health
            },
            activeOperations: this.activeOperations.size,
            toolUsage: this.analyzeToolUsage(),
            recommendations: this.getRecommendations(),
            alerts: this.status.alerts,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Clear completed operations from history
     */
    clearHistory() {
        this.operationHistory = [];
        console.log('🍎 Operation history cleared');
    }

    /**
     * Reset the overseer
     */
    reset() {
        this.activeOperations.clear();
        this.toolStates.clear();
        this.operationHistory = [];
        this.status.alerts = [];
        this.updateStatus();
        console.log('🍎 Apple Overseer reset');
    }
}

// Make available globally
window.AppleOverseer = AppleOverseer;
