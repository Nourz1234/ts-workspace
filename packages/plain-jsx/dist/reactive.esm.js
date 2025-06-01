class ReactiveNode {
    static resolveNode(node) {
        return node instanceof DocumentFragment
            ? Array.from(node.childNodes)
            : [node];
    }
    children = [document.createComment('')];
    update(node) {
        node ??= document.createComment('');
        const children = ReactiveNode.resolveNode(node);
        const firstChild = this.children[0];
        const parentNode = firstChild.parentNode;
        if (parentNode) {
            const newChildren = Array.from(parentNode.childNodes);
            newChildren.splice(newChildren.indexOf(firstChild), this.children.length, ...children);
            parentNode.replaceChildren(...newChildren);
        }
        this.children = children;
    }
    getRoot() {
        const fragment = document.createDocumentFragment();
        fragment.append(...this.children);
        return fragment;
    }
}
// another version utilizing Set.difference
// export class ReactiveNode {
//     private static resolveNode(node: Node): Set<Node> {
//         return node instanceof DocumentFragment
//             ? new Set(node.childNodes)
//             : new Set([node]);
//     }
//     private children = new Set<Node>([document.createComment('')]);
//     public update(node: Node | null) {
//         node ??= document.createComment('');
//         const children = ReactiveNode.resolveNode(node);
//         const firstChild = this.children.values().next().value!;
//         const parentNode = firstChild.parentNode;
//         if (parentNode) {
//             const existingChildren: Node[] = Array.from(parentNode.childNodes);
//             existingChildren.splice(existingChildren.indexOf(firstChild), 0, ...children);
//             const newChildren = new Set(existingChildren).difference(this.children);
//             parentNode.replaceChildren(...newChildren);
//         }
//         this.children = children;
//     }
//     public getRoot(): Node {
//         const fragment = document.createDocumentFragment();
//         fragment.append(...this.children);
//         return fragment;
//     }
// }

export { ReactiveNode };
