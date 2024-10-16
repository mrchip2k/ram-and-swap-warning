/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

// what is this
const GETTEXT_DOMAIN = 'my-indicator-extension';

const { GObject, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;

// get swap/memory usage functions use this
const ByteArray = imports.byteArray;

const _ = ExtensionUtils.gettext;

// Yoink
// https://github.com/LGiki/gnome-shell-extension-simple-system-monitor/blob/2099966069bc81acbcb7aecf32ed5d759921b469/src/extension.js#L351
function run_system_monitor() {
    const appSystem = Shell.AppSystem.get_default();
    let systemMonitorApp = appSystem.lookup_app('gnome-system-monitor.desktop');
    if (systemMonitorApp) {
        systemMonitorApp.activate();
    } else {
        systemMonitorApp = appSystem.lookup_app('org.gnome.Usage.desktop');
        systemMonitorApp.activate();
    }
}

// Yoink
// https://github.com/LGiki/gnome-shell-extension-simple-system-monitor/blob/2099966069bc81acbcb7aecf32ed5d759921b469/src/extension.js#L157
const getCurrentSwapUsage = () => {
    let currentSwapUsage = 0;

    try {
        const inputFile = Gio.File.new_for_path('/proc/meminfo');
        const [, content] = inputFile.load_contents(null);
        const contentStr = ByteArray.toString(content);
        const contentLines = contentStr.split('\n');

        let swapTotal = -1;
        let swapFree = -1;

        for (let i = 0; i < contentLines.length; i++) {
            const fields = contentLines[i].trim().split(/\W+/);

            if (fields.length < 2) {
                break;
            }

            const itemName = fields[0];
            const itemValue = Number.parseInt(fields[1]);

            if (itemName == 'SwapTotal') {
                swapTotal = itemValue;
            }

            if (itemName == 'SwapFree') {
                swapFree = itemValue;
            }

            if (swapTotal !== -1 && swapFree !== -1) {
                break;
            }
        }

        if (swapTotal !== -1 && swapFree !== -1 && swapTotal !== 0) {
            currentSwapUsage = 1 - swapFree / swapTotal;
        }
    } catch (e) {
        logError(e);
    }

    return currentSwapUsage;
};

// Yoink
// https://github.com/LGiki/gnome-shell-extension-simple-system-monitor/blob/2099966069bc81acbcb7aecf32ed5d759921b469/src/extension.js#L202
const getCurrentMemoryUsage = () => {
    let currentMemoryUsage = 0;

    try {
        const inputFile = Gio.File.new_for_path('/proc/meminfo');
        const [, content] = inputFile.load_contents(null);
        const contentStr = ByteArray.toString(content);
        const contentLines = contentStr.split('\n');

        let memTotal = -1;
        let memAvailable = -1;

        for (let i = 0; i < contentLines.length; i++) {
            const fields = contentLines[i].trim().split(/\W+/);

            if (fields.length < 2) {
                break;
            }

            const itemName = fields[0];
            const itemValue = Number.parseInt(fields[1]);

            if (itemName == 'MemTotal') {
                memTotal = itemValue;
            }

            if (itemName == 'MemAvailable') {
                memAvailable = itemValue;
            }

            if (memTotal !== -1 && memAvailable !== -1) {
                break;
            }
        }

        if (memTotal !== -1 && memAvailable !== -1) {
            const memUsed = memTotal - memAvailable;
            currentMemoryUsage = memUsed / memTotal;
        }
    } catch (e) {
        logError(e);
    }
    return currentMemoryUsage;
};

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('My Shiny Indicator'));

        this._container = new St.BoxLayout({
        });

        this._icon_ram = new St.Icon({
            icon_name: 'memory-symbolic',
            style_class: 'system-status-icon',
        });
        this._icon_swap = new St.Icon({
            icon_name: 'drive-harddisk-symbolic',
            style_class: 'system-status-icon',
        });

        this.add_child(this._container);
        this._container.add_child(this._icon_ram);
        this._container.add_child(this._icon_swap);

        // 0 means ok, 1 means spicy, 2 means critical.
        // This is stored to maybe save performance, by skipping changing the layout if no update occurred.
        // Default to -1 so the first update() never skips.
        this._status_ram = -1;
        this._status_swap = -1;

        let ram_popup = new PopupMenu.PopupMenuItem('RAM:');
        let swap_popup = new PopupMenu.PopupMenuItem('Swap:');
        this.menu.addMenuItem(ram_popup);
        this.menu.addMenuItem(swap_popup);

        this._ram_text = new St.Label({text: "balls%"});
        this._swap_text = new St.Label({text: "balls%"});

        ram_popup.add_child(this._ram_text);
        swap_popup.add_child(this._swap_text);

        ram_popup.connect('activate', () => {
            run_system_monitor();
        });
        swap_popup.connect('activate', () => {
            run_system_monitor();
        });

        let settings = new PopupMenu.PopupMenuItem('Settings');
        settings.connect('activate', () => {
            Main.notify(_('troled?')); //TODO
        });
        this.menu.addMenuItem(settings);
    }

    update(newRamStatus, newSwapStatus, ramPercent, swapPercent) {
        this._ram_text.text = ramPercent + "% used";
        this._swap_text.text = swapPercent + "% used";

        if (newRamStatus == this._status_ram && newSwapStatus == this._status_swap) {
            return;
        }

        this._status_ram = newRamStatus;
        this._status_swap = newSwapStatus;

        switch (newRamStatus) {
            case 1:
                this._icon_ram.set_style_class_name('system-status-icon ramswap-warn');
                break;
            case 2:
                this._icon_ram.set_style_class_name('system-status-icon ramswap-critical');
                break;
            default:
                this._icon_ram.set_style_class_name('system-status-icon ramswap-ok');
                break;
        }

        switch (newSwapStatus) {
            case 1:
                this._icon_swap.set_style_class_name('system-status-icon ramswap-warn');
                break;
            case 2:
                this._icon_swap.set_style_class_name('system-status-icon ramswap-critical');
                break;
            default:
                this._icon_swap.set_style_class_name('system-status-icon ramswap-ok');
                break;
        }
    }
});

class Extension {
    mine_bitcoin() {
        let ram_usage_reading = getCurrentMemoryUsage();
        let ram_status = 0;
        if (ram_usage_reading > 0.75) {
            ram_status = 1;
        } else if (ram_usage_reading > 0.9) {
            ram_status = 2;
        }

        let swap_usage_reading = getCurrentSwapUsage();
        let swap_status = 0;
        if (swap_usage_reading > 0.5) {
            swap_status = 1;
        } else if (swap_usage_reading > 0.75) {
            swap_status = 2;
        }

        this._indicator.update(
            ram_status,
            swap_status,
            (ram_usage_reading * 100).toFixed(1),
            (swap_usage_reading * 100).toFixed(1)
        );
    }


    constructor(uuid) {
        this._uuid = uuid;

        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this._uuid, this._indicator);

        this._indicator.update(0, 0, "-", "-");

        // Ticking
        this._timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT_IDLE,
            3,
            this.mine_bitcoin.bind(this),
        );
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;

        if (this._timeout != null) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
