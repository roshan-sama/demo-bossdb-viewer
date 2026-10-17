import { Component, signal } from '@angular/core';
import { EdgeAnimated } from './edge-animated';
import { EdgeEditor } from './edge-editor';
import { tabKeyTarget } from './tab-nav';

interface SubTab {
  id: string;
  label: string;
}

/** The edge-detection tab: the static kernel and band editor, and the animated sweep, as two subtabs. */
@Component({
  selector: 'app-edge-tools',
  imports: [EdgeEditor, EdgeAnimated],
  templateUrl: './edge-tools.html',
})
export class EdgeTools {
  protected readonly tabs: SubTab[] = [
    { id: 'static', label: 'Static edge detection' },
    { id: 'animated', label: 'Animated edge detection' },
  ];
  protected readonly active = signal(this.tabs[0].id);

  /** Arrow keys move between the subtabs, as in the ARIA tabs pattern. */
  protected onTabKey(e: KeyboardEvent, i: number): void {
    const next = tabKeyTarget(e.key, i, this.tabs.length);
    if (next < 0) return;
    e.preventDefault();
    this.active.set(this.tabs[next].id);
    queueMicrotask(() => document.getElementById('subtab-' + this.tabs[next].id)?.focus());
  }
}
