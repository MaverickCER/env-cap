---
"@maverickcer/env-cap": minor
---

A variable declared in more than one contract is documented once: every field a declaration leaves unset is filled from a declaration of the same variable when one of the two comes from a package's contract, in either direction: the application's declaration takes the package's explanation, and the package's declaration shows the application's own `expiresAt` or `owner` when the application's contracts that set it agree (alternatives that disagree, such as two databases, give it neither). Two of the application's own contracts never fill each other. An application can therefore add only its own `expiresAt` or `owner` to a variable a package already explains. `DUPLICATE_VARIABLE_DOCUMENTATION` is now reported only for a field both declarations set differently.
