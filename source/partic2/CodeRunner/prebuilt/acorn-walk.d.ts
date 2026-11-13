import { AnyNode, Expression, Statement, Function, Class, Pattern, VariableDeclaration, Node } from './acorn.js';

type FullWalkerCallback<TState> = (
  node: AnyNode,
  state: TState,
  type: string
) => void

type FullAncestorWalkerCallback<TState> = (
  node: AnyNode,
  state: TState,
  ancestors: AnyNode[],
  type: string
) => void

type AggregateType = {
  Expression: Expression,
  Statement: Statement,
  Function: Function,
  Class: Class,
  Pattern: Pattern,
  ForInit: VariableDeclaration | Expression
}

type SimpleVisitors<TState> = {
  [type in AnyNode["type"]]?: (node: Extract<AnyNode, { type: type }>, state: TState) => void
} & {
  [type in keyof AggregateType]?: (node: AggregateType[type], state: TState) => void
}

type AncestorVisitors<TState> = {
  [type in AnyNode["type"]]?: ( node: Extract<AnyNode, { type: type }>, state: TState, ancestors: AnyNode[]
) => void
} & {
  [type in keyof AggregateType]?: (node: AggregateType[type], state: TState, ancestors: AnyNode[]) => void
}

type WalkerCallback<TState> = (node: AnyNode, state: TState) => void

type RecursiveVisitors<TState> = {
  [type in AnyNode["type"]]?: ( node: Extract<AnyNode, { type: type }>, state: TState, callback: WalkerCallback<TState>) => void
} &  {
  [type in keyof AggregateType]?: (node: AggregateType[type], state: TState, callback: WalkerCallback<TState>) => void
}

type FindPredicate = (type: string, node: AnyNode) => boolean

interface Found<TState> {
  node: AnyNode,
  state: TState
}

/**
 * does a 'simple' walk over a tree
 * @param node the AST node to walk
 * @param visitors an object with properties whose names correspond to node types in the {@link https://github.com/estree/estree | ESTree spec}. The properties should contain functions that will be called with the node object and, if applicable the state at that point.
 * @param base a walker algorithm
 * @param state a start state. The default walker will simply visit all statements and expressions and not produce a meaningful state. (An example of a use of state is to track scope at each point in the tree.)
 */
declare function simple<TState>(
  node: Node,
  visitors: SimpleVisitors<TState>,
  base?: RecursiveVisitors<TState>,
  state?: TState
): void

/**
 * does a 'simple' walk over a tree, building up an array of ancestor nodes (including the current node) and passing the array to the callbacks as a third parameter.
 */
declare function ancestor<TState>(
    node: Node,
    visitors: AncestorVisitors<TState>,
    base?: RecursiveVisitors<TState>,
    state?: TState
  ): void

/**
 * does a 'recursive' walk, where the walker functions are responsible for continuing the walk on the child nodes of their target node.
 * @param node
 * @param state the start state
 * @param functions contain an object that maps node types to walker functions
 * @param base provides the fallback walker functions for node types that aren't handled in the {@link functions} object. If not given, the default walkers will be used.
 */
declare function recursive<TState>(
  node: Node,
  state: TState,
  functions: RecursiveVisitors<TState>,
  base?: RecursiveVisitors<TState>
): void

/**
 * does a 'full' walk over a tree, calling the {@link callback} with the arguments (node, state, type) for each node
 */
declare function full<TState>(
  node: Node,
  callback: FullWalkerCallback<TState>,
  base?: RecursiveVisitors<TState>,
  state?: TState
): void

/**
 * does a 'full' walk over a tree, building up an array of ancestor nodes (including the current node) and passing the array to the callbacks as a third parameter.
 */
declare function fullAncestor<TState>(
  node: Node,
  callback: FullAncestorWalkerCallback<TState>,
  base?: RecursiveVisitors<TState>,
  state?: TState
): void

/**
 * builds a new walker object by using the walker functions in {@link functions} and filling in the missing ones by taking defaults from {@link base}.
 */
declare function make<TState>(
  functions: RecursiveVisitors<TState>,
  base?: RecursiveVisitors<TState>
): RecursiveVisitors<TState>

/**
 * tries to locate a node in a tree at the given start and/or end offsets, which satisfies the predicate test. {@link start} and {@link end} can be either `null` (as wildcard) or a `number`. {@link test} may be a string (indicating a node type) or a function that takes (nodeType, node) arguments and returns a boolean indicating whether this node is interesting. {@link base} and {@link state} are optional, and can be used to specify a custom walker. Nodes are tested from inner to outer, so if two nodes match the boundaries, the inner one will be preferred.
 */
declare function findNodeAt<TState>(
  node: Node,
  start: number | undefined | null,
  end?: number | undefined | null,
  type?: FindPredicate | string,
  base?: RecursiveVisitors<TState>,
  state?: TState
): Found<TState> | undefined

/**
 * like {@link findNodeAt}, but will match any node that exists 'around' (spanning) the given position.
 */
declare function findNodeAround<TState>(
  node: Node,
  start: number | undefined | null,
  type?: FindPredicate | string,
  base?: RecursiveVisitors<TState>,
  state?: TState
): Found<TState> | undefined

/**
 * Find the outermost matching node after a given position.
 */
declare const findNodeAfter: typeof findNodeAround

/**
 * Find the outermost matching node before a given position.
 */
declare const findNodeBefore: typeof findNodeAround

declare const base: RecursiveVisitors<any>

export { ancestor, base, findNodeAfter, findNodeAround, findNodeAt, findNodeBefore, full, fullAncestor, make, recursive, simple };
export type { AncestorVisitors, FindPredicate, Found, FullAncestorWalkerCallback, FullWalkerCallback, RecursiveVisitors, SimpleVisitors, WalkerCallback };
