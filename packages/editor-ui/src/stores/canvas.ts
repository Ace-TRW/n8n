import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { v4 as uuid } from 'uuid';
import normalizeWheel from 'normalize-wheel';
import { useWorkflowsStore } from '@/stores/workflows';
import { useNodeTypesStore } from '@/stores/nodeTypes';
import { useUIStore } from '@/stores/ui';
import { useHistoryStore } from '@/stores/history';
import { INodeUi, XYPosition } from '@/Interface';
import { scaleBigger, scaleReset, scaleSmaller } from '@/utils';
import { START_NODE_TYPE, STICKY_NODE_TYPE } from '@/constants';
import type { BeforeStartEventParams, BrowserJsPlumbInstance, DragStartEventParams, DragStopEventParams } from '@jsplumb/browser-ui';
import { newInstance as newJsPlumbInstance } from '@jsplumb/browser-ui';
import { N8nPlusEndpointHandler } from '@/plugins/endpoints/N8nPlusEndpointType';
import * as N8nPlusEndpointRenderer from '@/plugins/endpoints/N8nPlusEndpointRenderer';
import { N8nConnector } from '@/plugins/connectors/N8nCustomConnector';
import { EndpointFactory, Connectors } from '@jsplumb/core';
import { MoveNodeCommand } from '@/models/history';
import {
	DEFAULT_PLACEHOLDER_TRIGGER_BUTTON,
	getMidCanvasPosition,
	getNewNodePosition,
	getZoomToFit,
	PLACEHOLDER_TRIGGER_NODE_SIZE,
	CONNECTOR_FLOWCHART_TYPE,
	GRID_SIZE,
} from '@/utils/nodeViewUtils';

export const useCanvasStore = defineStore('canvas', () => {
	const workflowStore = useWorkflowsStore();
	const nodeTypesStore = useNodeTypesStore();
	const uiStore = useUIStore();
	const historyStore = useHistoryStore();

	console.log('Before');
	const newInstance = ref<BrowserJsPlumbInstance>();
	const isDragging = ref<boolean>(false);

	const nodes = computed<INodeUi[]>(() => workflowStore.allNodes);
	const triggerNodes = computed<INodeUi[]>(() =>
		nodes.value.filter(
			(node) => node.type === START_NODE_TYPE || nodeTypesStore.isTriggerNode(node.type),
		),
	);
	const isDemo = ref<boolean>(false);
	const nodeViewScale = ref<number>(1);
	const canvasAddButtonPosition = ref<XYPosition>([1, 1]);

	Connectors.register(N8nConnector.type, N8nConnector);
	N8nPlusEndpointRenderer.register();
	EndpointFactory.registerHandler(N8nPlusEndpointHandler);

	const setRecenteredCanvasAddButtonPosition = (offset?: XYPosition) => {
		const position = getMidCanvasPosition(nodeViewScale.value, offset || [0, 0]);

		position[0] -= PLACEHOLDER_TRIGGER_NODE_SIZE / 2;
		position[1] -= PLACEHOLDER_TRIGGER_NODE_SIZE / 2;

		canvasAddButtonPosition.value = getNewNodePosition(nodes.value, position);
	};

	const getPlaceholderTriggerNodeUI = (): INodeUi => {
		setRecenteredCanvasAddButtonPosition();

		return {
			id: uuid(),
			...DEFAULT_PLACEHOLDER_TRIGGER_BUTTON,
			position: canvasAddButtonPosition.value,
		};
	};

	const getNodesWithPlaceholderNode = (): INodeUi[] =>
		triggerNodes.value.length > 0 ? nodes.value : [getPlaceholderTriggerNodeUI(), ...nodes.value];

	const setZoomLevel = (zoomLevel: number, offset: XYPosition) => {
		nodeViewScale.value = zoomLevel;
		newInstance.value?.setZoom(zoomLevel);
		uiStore.nodeViewOffsetPosition = offset;
	};

	const resetZoom = () => {
		const { scale, offset } = scaleReset({
			scale: nodeViewScale.value,
			offset: uiStore.nodeViewOffsetPosition,
		});
		setZoomLevel(scale, offset);
	};

	const zoomIn = () => {
		const { scale, offset } = scaleBigger({
			scale: nodeViewScale.value,
			offset: uiStore.nodeViewOffsetPosition,
		});
		setZoomLevel(scale, offset);
	};

	const zoomOut = () => {
		const { scale, offset } = scaleSmaller({
			scale: nodeViewScale.value,
			offset: uiStore.nodeViewOffsetPosition,
		});
		setZoomLevel(scale, offset);
	};

	const zoomToFit = () => {
		const nodes = getNodesWithPlaceholderNode();
		if (!nodes.length) {
			// some unknown workflow executions
			return;
		}
		const { zoomLevel, offset } = getZoomToFit(nodes, !isDemo.value);
		setZoomLevel(zoomLevel, offset);
	};

	const wheelMoveWorkflow = (e: WheelEvent) => {
		const normalized = normalizeWheel(e);
		const offsetPosition = uiStore.nodeViewOffsetPosition;
		const nodeViewOffsetPositionX =
			offsetPosition[0] - (e.shiftKey ? normalized.pixelY : normalized.pixelX);
		const nodeViewOffsetPositionY =
			offsetPosition[1] - (e.shiftKey ? normalized.pixelX : normalized.pixelY);
		uiStore.nodeViewOffsetPosition = [nodeViewOffsetPositionX, nodeViewOffsetPositionY];
	};

	const wheelScroll = (e: WheelEvent) => {
		//* Control + scroll zoom
		if (e.ctrlKey) {
			if (e.deltaY > 0) {
				zoomOut();
			} else {
				zoomIn();
			}

			e.preventDefault();
			return;
		}
		wheelMoveWorkflow(e);
	};

	function initInstance(container: Element) {
		if(newInstance.value) {
			console.log('__DEBUG: newInstance.value already exists', newInstance.value);
		};
		newInstance.value = newJsPlumbInstance({
			container,
			connector: CONNECTOR_FLOWCHART_TYPE,
			resizeObserver: false,
			dragOptions: {
				cursor: 'pointer',
				// resizeObserver: false,
				grid: { w: GRID_SIZE, h: GRID_SIZE },
				start: (params: BeforeStartEventParams) => {
					const draggedNode = params.drag.getDragElement();
					const nodeName = draggedNode.getAttribute('data-name');
					if(!nodeName) return;
					const nodeData = workflowStore.getNodeByName(nodeName);
					console.log('Started dragging', params);
					// @ts-ignore
					isDragging.value = true;

					const isSelected = uiStore.isNodeSelected(nodeName);
					if (nodeData?.type === STICKY_NODE_TYPE && !isSelected) {
						setTimeout(() => {
							console.log('Node selected????');
							// this.$emit('nodeSelected', nodeName, false, true);
						}, 0);
					}

					if (params.e && !isSelected) {
						console.log("🚀 ~ file: canvas.ts:167 ~ initInstance ~ isSelected", isSelected);
						// Only the node which gets dragged directly gets an event, for all others it is
						// undefined. So check if the currently dragged node is selected and if not clear
						// the drag-selection.
						newInstance.value?.clearDragSelection();
						uiStore.resetSelectedNodes();
					}

					uiStore.addActiveAction('dragActive');
					return true;
				},
				stop: (params: DragStopEventParams) => {
					const draggedNode = params.drag.getDragElement();
					const nodeName = draggedNode.getAttribute('data-name');
					if(!nodeName) return;
					const nodeData = workflowStore.getNodeByName(nodeName);
					isDragging.value = false;
					if (uiStore.isActionActive('dragActive') && nodeData) {
						const moveNodes = uiStore.getSelectedNodes.slice();
						const selectedNodeNames = moveNodes.map((node: INodeUi) => node.name);
						if (!selectedNodeNames.includes(nodeData.name)) {
							// If the current node is not in selected add it to the nodes which
							// got moved manually
							moveNodes.push(nodeData);
						}

						if (moveNodes.length > 1) {
							historyStore.startRecordingUndo();
						}
						// This does for some reason just get called once for the node that got clicked
						// even though "start" and "drag" gets called for all. So lets do for now
						// some dirty DOM query to get the new positions till I have more time to
						// create a proper solution
						let newNodePosition: XYPosition;
						moveNodes.forEach((node: INodeUi) => {
							const element = document.getElementById(node.id);
							console.log("🚀 ~ file: canvas.ts:203 ~ moveNodes.forEach ~ element", element);
							if (element === null) {
								return;
							}

							newNodePosition = [
								parseInt(element.style.left!.slice(0, -2), 10),
								parseInt(element.style.top!.slice(0, -2), 10),
							];

							const updateInformation = {
								name: node.name,
								properties: {
									// @ts-ignore, draggable does not have definitions
									position: newNodePosition,
								},
							};
							const oldPosition = node.position;
							if (oldPosition[0] !== newNodePosition[0] || oldPosition[1] !== newNodePosition[1]) {
								// historyStore.pushCommandToUndo(
								// 	new MoveNodeCommand(node.name, oldPosition, newNodePosition, this),
								// );
								workflowStore.updateNodeProperties(updateInformation);
								// this.$emit('moved', node);
							}
						});
						if (moveNodes.length > 1) {
							historyStore.stopRecordingUndo();
						}
					}
				},
				filter: '.node-description, .node-description .node-name, .node-description .node-subtitle',
			},
		});
		newInstance.value?.setDragConstrainFunction((pos: XYPosition) => {
			const isReadOnly = uiStore.isReadOnly;
			console.log("🚀 ~ file: canvas.ts:147 ~ initInstance ~ isReadOnly", isReadOnly);
			if (isReadOnly) {
				// Do not allow to move nodes in readOnly mode
				return null;
			}
			return pos;
		});
		window.__plumbInstance = () => newInstance.value;
	}
	return {
		// jsPlumbInstance,
		// jsPlumbInstanceNew,
		isDemo,
		nodeViewScale,
		canvasAddButtonPosition,
		setRecenteredCanvasAddButtonPosition,
		getNodesWithPlaceholderNode,
		setZoomLevel,
		resetZoom,
		zoomIn,
		zoomOut,
		zoomToFit,
		wheelScroll,
		initInstance,
		newInstance,
	};
});
