export class FileScan {
  identifiers: string[];
}

export class ESImport {
  specifiers: string[];
  hasDefault: boolean;
  hasWildCard: boolean;
  source: boolean;
}

// TODO: `export ... from '...';`
export class ESExportSpecifier {
  specifier: string;
  isDefault = false;
}

export class ESFileScan extends FileScan {
  imports: ESImport[];
}
