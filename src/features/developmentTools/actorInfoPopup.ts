// SPDX-FileCopyrightText: 2026 mityax, 2026
//
// SPDX-License-Identifier: GPL-3.0-only

import Clutter from "gi://Clutter";
import {ModalDialog} from "resource:///org/gnome/shell/ui/modalDialog.js";
import * as Widgets from "$src/utils/ui/widgets";
import {css} from "$src/utils/ui/css";
import St from "gi://St";
import Graphene from "gi://Graphene";
import GObject from "gi://GObject";
import {repr} from "$src/core/logging";
import {Delay} from "$src/utils/delay";
import {clamp} from "$src/utils/utils";


// Properties to show in the tree, possibly only for a certain widget type:
const WIDGET_SPECIFIC_TREE_INFO: [typeof Clutter.Actor | null, string][] = [
    [null, 'iconName'],  // e.g. St.Icon
    [null, 'text'], // e.g. St.Label
];


export function showActorInfoPopup(actor: Clutter.Actor) {
    const d = new ModalDialog({
        destroyOnClose: true,
    });

    const {tree, targetNode} = _buildActorTree(actor);

    d.contentLayout.add_child(new Widgets.ScrollView({
        height: 0.45 * global.screenHeight,
        width: 0.7 * global.screenWidth,
        child: tree,
        onRealize: async (sc) => {
            // Scroll to the targeted node:
            await Delay.ms(100);
            const scrollPos = clamp(
                targetNode.get_transformed_position()[1]
                    - sc.get_transformed_position()[1]
                    - sc.get_transformed_size()[1] * (2/3),
                sc.vadjustment.lower,
                sc.vadjustment.upper,
            );
            // @ts-ignore
            sc.vadjustment.ease(scrollPos, { duration: 150 });
        },
    }));

    d.addButton({
        label: 'Close',
        action: () => d.close(),
    });
    d.open();
}


function _buildActorTree(actor: Clutter.Actor) {
    let chain = [actor];
    while (chain[0].get_parent() !== null)
        chain.unshift(chain[0].get_parent()!);

    let targetNode: St.Widget;  // the node for the actor picked by the user

    const tree = _buildTreeNode(chain[0], chain, (a, node) => {
        if (a === actor) targetNode = node;
    });

    targetNode!.style += "color: orange;"

    return {tree, targetNode: targetNode!};
}

function _buildTreeNode(
    actor: Clutter.Actor,
    chain: Clutter.Actor[],
    nodeBuiltCb: (actor: Clutter.Actor, node: Widgets.Column) => void,
    level: number = 0,
): Widgets.Column {
    const initiallyExpanded = chain.includes(actor);

    const container = new Widgets.Ref<Widgets.Column>();
    const expandBtn = new Widgets.Ref<Widgets.Button>();
    const detailsContainer = new Widgets.Ref<Widgets.Column>();

    const toggleExpand = () => {
        if (!detailsContainer.current?.visible) {
            // Lazily build the child for non-initially-expanded tree nodes:
            if (!detailsContainer.current) {
                container.current!.add_child(buildDetailsContainer());
            }
            detailsContainer.current!.show();
            expandBtn.current!.rotationAngleZ = 90;
        } else {
            detailsContainer.current?.hide();
            expandBtn.current!.rotationAngleZ = 0;
        }
    }

    const buildDetailsContainer = () => new Widgets.Column({
        ref: detailsContainer,
        visible: initiallyExpanded,
        style: css({
            marginLeft: "30px",  // indent details and children
        }),
        children: [
            ..._buildActorInfo(actor),
            ...actor
                .get_children()
                .map(child => _buildTreeNode(child, chain, nodeBuiltCb, level + 1)),
        ]
    });

    return new Widgets.Column({
        ref: container,
        style: css({
            marginTop: "5px",
            fontFamily: "monospace",
        }),
        children: [
            new Widgets.Row({
                children: [
                    new Widgets.Button({
                        ref: expandBtn,
                        iconName: "pan-end-symbolic",
                        pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
                        rotationAngleZ: initiallyExpanded ? 90 : 0,
                        style: css({
                            width: "15px",
                            height: "15px",
                            marginRight: "5px",
                        }),
                        onClicked: () => toggleExpand(),
                    }),
                    new Widgets.Label({
                        text: actor.name ?? actor.constructor.name ?? actor.toString(),
                        style: css({
                            fontWeight: "bold",
                        })
                    }),
                    new Widgets.Icon({
                        iconName: 'user-not-tracked-symbolic',
                        style: css({ width: "0.8em", height: "0.8em", marginLeft: "5px" }),
                        opacity: 128,
                        onCreated: (i) => {
                            actor.bind_property('visible', i, 'visible',
                                GObject.BindingFlags.INVERT_BOOLEAN | GObject.BindingFlags.SYNC_CREATE);
                        },
                    }),
                ],
            }),
            initiallyExpanded
                ? buildDetailsContainer()
                : null,
        ].filter(e => e !== null) as St.Widget[],
        onCreated: (nodeContainer) => nodeBuiltCb(actor, nodeContainer),
    });
}


function _buildActorInfo(actor: Clutter.Actor) {
    const res = [];

    // CSS Selector:
    if (actor.name || (actor instanceof St.Widget && actor.styleClass)) {
        const formattedSelector =
            `${actor.name !== null ? `#${actor.name}` : ''}` +
            `${actor instanceof St.Widget && actor.styleClass ? '.' + actor.styleClass.replace(/ +/g, '.') : ''}`;
        res.push(new Widgets.Label({
            text: formattedSelector,
            style: css({
                fontSize: "smaller",
                color: "skyblue",
            })
        }));
    }

    // Important props:
    WIDGET_SPECIFIC_TREE_INFO.forEach(([class_, prop]) => {
        try {
            if ((!class_ || actor instanceof class_) && actor[prop as keyof typeof actor]) {
                res.push(new Widgets.Label({
                    text: `${prop}: ${repr(actor[prop as keyof typeof actor])}`,
                    style: css({
                        fontSize: "smaller",
                    }),
                    onCreated: (lbl) => {
                        try {
                            // @ts-ignore
                            actor.connectObject(
                                `notify::${prop}`,
                                () => lbl.text = `${prop}: ${repr(actor[prop as keyof typeof actor])}`,
                                lbl,
                            )
                        } catch {}
                    }
                }));
            }
        } catch (e) {}
    });

    return res;
}