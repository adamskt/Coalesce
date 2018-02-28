
/// <reference path="../coalesce.dependencies.d.ts" />

module ViewModels {
    // *** External Type ProductDetails
    export class ProductDetails
    {

        // Observables
        public manufacturingAddress: KnockoutObservable<ViewModels.StreetAddress | null> = ko.observable(null);
        public companyHqAddress: KnockoutObservable<ViewModels.StreetAddress | null> = ko.observable(null);
        // Loads this object from a data transfer object received from the server.
        public parent: any;
        public parentCollection: any;

        public loadFromDto = (data: any) => {
            if (!data) return;

            // Load the properties.
            if (!this.manufacturingAddress()){
                this.manufacturingAddress(new StreetAddress(data.manufacturingAddress, this));
            }else{
                this.manufacturingAddress()!.loadFromDto(data.manufacturingAddress);
            }
            if (!this.companyHqAddress()){
                this.companyHqAddress(new StreetAddress(data.companyHqAddress, this));
            }else{
                this.companyHqAddress()!.loadFromDto(data.companyHqAddress);
            }

        };

                /** Saves this object into a data transfer object to send to the server. */
        public saveToDto = (): any => {
            var dto: any = {};
            
            
            return dto;
        }


        constructor(newItem?: any, parent?: any){
            this.parent = parent;
            // Load the object

            if (newItem) {
                this.loadFromDto(newItem);
            }
        }
    }
}
