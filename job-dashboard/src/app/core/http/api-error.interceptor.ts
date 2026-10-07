import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const msg =
          error.status === 0
            ? 'No se pudo conectar con el servidor. Comprueba que el backend esté iniciado.'
            : (error.error?.detail ?? error.message ?? 'Error de red');
        snackBar.open(String(msg), 'Cerrar', { duration: 5000 });
      } else {
        snackBar.open('Error inesperado', 'Cerrar', { duration: 5000 });
      }
      return throwError(() => error);
    })
  );
};
