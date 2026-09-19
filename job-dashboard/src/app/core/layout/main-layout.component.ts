import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

type NavItem = { label: string; icon: string; to: string };

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatListModule,
    MatDividerModule,
    MatMenuModule
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);

  readonly nav: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', to: '/dashboard' },
    { label: 'Trabajos', icon: 'work', to: '/jobs' },
    { label: 'Yo aplico', icon: 'smart_toy', to: '/yo-aplico' },
    { label: 'Postulaciones', icon: 'send', to: '/applications' },
    { label: 'Perfil', icon: 'person', to: '/profile' },
    { label: 'Configuración', icon: 'settings', to: '/settings' },
    { label: 'Estadísticas', icon: 'bar_chart', to: '/stats' }
  ];

  readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((state) => state.matches)),
    { initialValue: false }
  );

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.nav.find((item) => this.router.url.startsWith(item.to))?.label ?? 'Dashboard')
    ),
    { initialValue: 'Dashboard' }
  );

  maybeClose(drawer: MatSidenav) {
    if (this.isHandset()) drawer.close();
  }
}
