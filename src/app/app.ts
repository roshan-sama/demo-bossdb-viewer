import { Component } from '@angular/core';
import { Explorer } from './explorer/explorer';
import { ToolsPanel } from './tools/tools-panel';
import { Footer } from './ui/footer/footer';

@Component({
  selector: 'app-root',
  imports: [Explorer, Footer, ToolsPanel],
  templateUrl: './app.html',
})
export class App {}
