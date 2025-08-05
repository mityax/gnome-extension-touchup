import GLib from "gi://GLib";
import St from "gi://St";
import Pango from "gi://Pango";
import Gio from "gi://Gio";
import * as Config from "resource:///org/gnome/shell/misc/config.js";

import {ModalDialog} from "resource:///org/gnome/shell/ui/modalDialog.js";
import {MessageDialogContent} from "resource:///org/gnome/shell/ui/dialog.js";

import * as Widgets from "./ui/widgets";
import TouchUpExtension from "../extension";
import {NotificationService} from "../services/notificationService";


export function showFeatureInitializationFailedNotification(featureName: string, error: any) {
    const notificationService = TouchUpExtension.instance!.getFeature(NotificationService);

    if (!notificationService) return;

    // Show an error notification:
    const notification = notificationService.create({
        title: 'Couldn\'t initialize feature',
        body: `An error occurred while initializing the feature "${featureName}". This is likely due to a ` +
            `(partially) incompatible environment, for example a modified version of Gnome Shell such as in Ubuntu. ` +
            `The feature has been disabled for now – unaffected features might continue working.`
    });
    notification.connect('activated', showDetails);
    notification.addAction('See details', showDetails);
    notification.addAction('Report issue', reportIssue);
    notificationService.show(notification);

    // Prepare details for error report:
    const metadata = TouchUpExtension.instance!.metadata as Record<string, any>;
    const systemInfo = `${GLib.get_os_info('NAME')}, version: ${GLib.get_os_info('VERSION')}`;
    const shellInfo = `${Config.PACKAGE_NAME} ${Config.PACKAGE_VERSION}`
    const extensionInfo = `TouchUp v. ${metadata["version-name"]} (#${metadata.version}, commit-sha: ${metadata['commit-sha'] ?? 'unknown'})`;
    let errorInfo = `${error.constructor.name}${error.message ? ': ' + error.message : ' (no error message)'}`;
    if (error.stack) {
        errorInfo += "\n\n" + error.stack
            .replaceAll(TouchUpExtension.instance!.metadata.dir.get_uri() + '/', '')
            .replaceAll(/(file:\/\/)?\/home\/.*?\//g, '~/')
            .trim();
    }

    // Show a modal dialog with the error information:
    function showDetails() {
        let details = `${errorInfo}\n\n---\n` +
            `Extension: ${extensionInfo}\n` +
            `Shell: ${shellInfo.replaceAll('gnome-shell', 'Gnome Shell')}\n` +
            `Operating System: ${systemInfo}\n`;

        const d = new ModalDialog({destroyOnClose: true});

        const content = new MessageDialogContent({
            title: 'Error during TouchUp initialization',
            description: `An error occurred during initializing the \"${featureName}\" feature`,
        });
        content.add_child(new Widgets.ScrollView({
            height: 0.45 * global.screenHeight,
            width: 0.7 * global.screenWidth,
            hscrollbarPolicy: St.PolicyType.ALWAYS,
            vscrollbarPolicy: St.PolicyType.AUTOMATIC,
            child: new Widgets.Label({
                text: details,
                style: 'font-family: monospace; cursor: text;',
                reactive: true,
                canFocus: true,
                trackHover: true,
                onCreated: label => {
                    label.clutterText.selectable = true;
                    label.clutterText.reactive = true;
                    label.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
                }
            }),
        }));

        d.contentLayout.add_child(content);

        d.addButton({
            label: 'Report this information',
            action: () => {
                reportIssue();
                d.close();
            },
            default: true,
        });
        d.addButton({
            label: 'Close',
            action: () => d.close(),
        });
        d.open();
    }

    // Open a link to a pre-filled issue creation form:
    function reportIssue() {
        let body = `An error occurred during initializing the \"${featureName}\" feature:\n\n` +
            `\`\`\`\n${errorInfo}\n\`\`\`\n\n` +
            `**Extension:** ${extensionInfo}\n` +
            `**Shell:** ${shellInfo.replaceAll('gnome-shell', 'Gnome Shell')}\n` +
            `**Operating System:** ${systemInfo}\n`;

        Gio.AppInfo.launch_default_for_uri(
            'https://github.com/mityax/gnome-extension-touchup/issues/new' +
            `?title=${encodeURIComponent(`Error initializing feature "${featureName}"`)}` +
            `&body=${encodeURIComponent(body)}` +
            '&template=bug_report.md' +
            '&labels[]=bug' +
            '&labels[]=compatibility-issue' +
            '&labels[]=auto-reported',
            null,
        );
    }
}


