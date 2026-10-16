import { Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';


@Component({
  selector: 'app-footer',
  template: `
  <div>This is an independant project created by <a target="blank" href="https://www.linkedin.com/in/roshan-m-780824a9/" rel="noreferrer noopener">Roshan Manuel</a> and not affiliated with JHU APL. Visit the project's <a href="https://github.com/roshan-sama/demo-bossdb-viewer/blob/main/SOURCES.md">Sources.md</a> on Github for more info and attribution information</div>
  `,
})
export class Footer {
}