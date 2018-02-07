const KeyValueTable = require("./KeyValueTable"); //for extends
const SmartDict = require("./SmartDict"); //for extends
const Dweb = require("./Dweb");
//TODO-DOMAIN when "register" maybe store publicurl sa the registration, then check can fetch via p_fetch from that.

//Mixins based on https://javascriptweblog.wordpress.com/2011/05/31/a-fresh-look-at-javascript-mixins/

const SignatureMixin = function(fieldlist) {
    /*
        This mixin is a generic signature tool, allows to specify which fields of an object should be signed/verified.

        Fields:
        signatures: [{
            date,                   ISODate when signed
            signature,              Signature (see KeyPair)
            signedby,               Exported Public Key of Signer (see KeyPair)
            }]                      Each signature is of JSON.stringify({date, domains, name, keys, urls|tablepublicurls, expires})
     */
    this.fieldlist = fieldlist;

    this.signatureConstructor = function() {
        this.signatures = this.signatures || [];
    };
    this._signable = function(date) {
        return JSON.stringify({"date": date, signed: Dweb.utils.keyFilter(this, this.__proto__.fieldlist)});
    };
    this._signSelf = function(keypair) { // Pair of verify
        const date = new Date(Date.now());
        this.signatures.push({date,
            signature: keypair.sign(  this._signable(date)),
            signedby: keypair.signingexport()
        })
    };
    this._verifyOwnSigs = function() { // Pair of sign
        // Return an array of keys that signed this match, caller should check it accepts those keys
        return this.signatures
            .filter(sig => (new Dweb.KeyPair({key: sig.signedby}).verify(this._signable(sig.date), sig.signature)))
            .map(sig => sig.signedby);
    };

    return this;
};

const NameMixin = function(options) {
    /*
        This Mixin defines fields and methods needed to name something in a Domain,
        Typically this will be either: another Domain; another SmartDict or class; raw content (e.g a PDF or HTML.

    Signed Fields
    urls | tablepublicurls    Where to find the object (or table if its a domain)
    expires: ISODATE         When this name should be considered expired (it might still be resolved, but not if newer names available.
    (there is no validfrom time, this is implicitly when it was signed)
    fullname: str           Names that this record applies to. e.g.  company/people/fred  family/smith/father. Mostly useful to go UP the path.

     */
    this.nameConstructor = function() {
        this.expires = this.expires || undefined;    // If Hasn't set
    };
    return this;
};
class Name extends SmartDict {
    /*
        The Name class is used to register another object in a domain.

        Fields inherited from NameMixin: expires; fullname;
        urls: Points at object being named (for a Transportable object its obj._publicurls)
        Fields inherited from SignatureMixin: signatures

     */
    constructor(data, verbose, options) {
        super(data, verbose, options);
        this.nameConstructor();   //
        this.signatureConstructor(); // Initialize Signatures
        this.table = 'name';

    }
    static async p_new(data, verbose, options) {
        if (data instanceof Dweb.Transportable) {
            data = {urls: data._publicurls || data._urls };  // Public if appropriate else _urls
        }
        return new this(data, verbose, options)
    }

    objbrowser_fields(propname) {
        const fieldtypes = { expires: "str", "urls": "urlarray", "fullname": "str", "signatures": "arrayjsonobj"};
        return fieldtypes[propname] || super.objbrowser_fields(propname);
    }

    async p_printable({indent="  ",indentlevel=0}={}) {
        // Output something that can be displayed for debugging
        return `${indent.repeat(indentlevel)}${this.fullname} = ${this.urls.join(', ')}${this.expires ? " expires:"+this.expires : ""}\n`
    }
    async p_resolve(path, {verbose=false}={}) {
        let obj;
        try {
            obj = await Dweb.SmartDict.p_fetch(this.urls, verbose);
        } catch(err) {
            throw new Dweb.errors.ResolutionError(`Unable to resolve urls ${this.urls} with SmartDict.p_fetch, ${err.message}`);
        }
        try {
            return await obj.p_resolve(path, {verbose: verbose});
        } catch(err) {
            throw new Dweb.errors.ResolutionError(`Obj of class ${obj.constructor.name} Cant do a p_resolve("${path}"), ${err.message}`);
        }
    }

}
NameMixin.call(Name.prototype);
SignatureMixin.call(Name.prototype, ["urls", "fullname", "expires"]);

class Domain extends KeyValueTable {
    /*
    The Domain class is for name resolution across multiple technologies.

    Domains are of the form Name:/arc/somedomain/somepath/somename

    Where signed records at each level lead to the next level

    Fields:
    keys: [NACL VERIFY:xyz*]   Public Key to use to verify entries - identified by type, any of these keys can be used to sign a record

    Fields inherited from NameMixin: fullname; expires; signatures

    Fields inherited from KeyValueTable
    tablepublicurls: [ str* ]       Where to find the table.
    _map:   KeyValueTable   Mapping of name strings beneath this Domain
    */
    constructor(data, master, key, verbose, options) {
        super(data, master, key, verbose, options); // Initializes _map if not already set
        this.table = "domain"; // Superclasses may override
        this.nameConstructor();  // from the Mixin, initializes signatures
        this.signatureConstructor();
    }
    static async p_new(data, master, key, verbose, options) {
        const obj = await super.p_new(data, master, key, verbose, {keyvaluetable: "domains"}); // Will default to call constructor
        if (obj._master && obj.keypair && !(obj.keys && obj.keys.length)) {
            obj.keys = [ obj.keypair.signingexport()]
        }
        return obj;
    }

    objbrowser_fields(propname) {
        const fieldtypes = { _map: "dictobj", "keys": "arraystr"};
        return fieldtypes[propname] || super.objbrowser_fields(propname);
    }

    sign(subdomain) { // Pair of verify
        subdomain._signSelf(this.keypair);
    }
    verify(name, subdomain) { // Pair of sign
        /* Check the subdomain is valid.
            That is teh case if the subdomain has a cryptographically valid signatures by one of the domain's keys and the fullname matches the name we have it at.
         */
        // its called when we think we have a resolution.
        //TODO-DOMAIN need to be cleverer about DOS, but at moment dont have failure case if KVT only accepts signed entries from table owner or verifies on retrieval.
        // Throws error if doesnt verify
        return subdomain._verifyOwnSigs().some(key => this.keys.includes(key))                       // Check valid sig by this
            && ([this.fullname,name].join('/') === subdomain.fullname); // Check name matches
    }

    async p_register(name, registrable, verbose) {
        /*
        Register an object
        name:   What to register it under, relative to "this"
        registrable:    Either a Domain or Name, or else something with _publicurls or _urls (i.e. after calling p_store) and it will be wrapped with a Name

        Code path is domain.p_register -> domain.p_set
         */
        if (!(registrable instanceof Domain || registrable instanceof Name)) {
            // If it isnt a Domain or Name then build a name to point at it
            registrable = await Name.p_new(registrable, verbose)
        }
        registrable.fullname =  [this.fullname, name].join("/");    // Set fullname to be this path
        this.sign(registrable);
        console.assert(this.verify(name, registrable));   // It better verify !
        await this.p_set(name, registrable, {publicOnly: true, encryptIfAcl: false, verbose: verbose});
    }
    /*
        ------------ Resolution ---------------------
        Strategy: At any point in resolution,
        * start with path - look that up,
        * if fails, remove right hand side and try again,
        * keep reducing till get to something can resolve.
      */

    async p_get(key, verbose) {
        //TODO-DOMAIN reconstructing this from KeyValueTable so can merge incomplete tables - next choose best - then store to others
        if (Array.isArray(key)) {
            const res = {};
            const self = this;
            await Promise.all(key.map((n) => { res[n] = self.p_get(n, verbose)}));
            return res;
        }
        if (this._map[key])
            return this._map[key]; // If already have a defined result then return it (it will be from this session so reasonable to cache)
        const rr = (await Promise.all(this.tablepublicurls.map(u => Dweb.Transports.p_get([u], key, verbose).catch((err) => undefined))))
            .map(r => this._mapFromStorage(r))
        // Errors in above will result in an undefined in the res array, which will be filtered out.
        // res is now an array of returned values in same order as tablepublicurls
        //TODO-DOMAIN should verify here before do this test
        const indexOfMostRecent = rr.reduce((iBest, r, i, arr) => (r && r.signatures[0].date) > (arr[iBest] && arr[iBest].signatures[0].date) ? i : iBest, 0);

        const value = rr[indexOfMostRecent];
        this._map[key] = value;
        return value;
    }


    async p_resolve(path, {verbose=false}={}) { // Note merges verbose into options, makes more sense since both are optional
        //TODO check for / at start, if so remove it and get root
        if (verbose) console.log("resolving",path,"in",this.fullname);
        const pathArray = path.split('/');
        const remainder = [];
        let res;
        // Look for path, try longest combination first, then work back to see if can find partial path
        while (pathArray.length > 0) {
            const name = pathArray.join('/');
            res = await this.p_get(name, verbose);
            if (res) {
                res = await Dweb.SmartDict._after_fetch(res, [], verbose);  //Turn into an object
                this.verify(name, res);                                     // Check its valid
                break;
            }
            remainder.unshift(pathArray.pop());                             // Loop around on subset of path
        }
        if (res) { // Found one
            if (!remainder.length) // We found it
                return res;
            return await res.p_resolve(remainder.join('/'), {verbose});           // ===== Note recursion ====
            //TODO need other classes e.g. SD  etc to handle p_resolve as way to get path
        } else {
            console.log("Unable to completely resolve",path,"in",this.fullname);
            return undefined;
        }
    }

    async p_printable({indent="  ",indentlevel=0}={}) {
        // Output something that can be displayed for debugging
        return `${indent.repeat(indentlevel)}${this.fullname} @ ${this.tablepublicurls.join(', ')}${this.expires ? " expires:"+this.expires : ""}\n`
            + (await Promise.all((await this.p_keys()).map(k => this._map[k].p_printable({indent, indentlevel: indentlevel + 1})))).join('')
    }
    static async p_setupOnce({verbose=false} = {}) { //TODO-DOMAIN move to own file
        const metadatagateway = 'http://localhost:4244/name/archiveid';
        const pass = "Replace this with something secret";
        const kc = await Dweb.KeyChain.p_new({name: "test_keychain kc"}, {passphrase: pass}, verbose);    //TODO-DOMAIN replace with secret passphrase
        Domain.root = await Domain.p_new({_acl: kc}, true, {passphrase: pass+"/"}, verbose);   //TODO-NAME will need a secure root key
        // /arc domain points at our top level resolver.
        //p_new should add registrars at whichever compliant transports are connected (YJS, HTTP)
        const arcDomain = await Domain.p_new({_acl: kc},true, {passphrase: pass+"/arc"});
        await Domain.root.p_register("arc", arcDomain, verbose);
        const archiveOrgDomain = await Domain.p_new({_acl: kc}, true, {passphrase: pass+"/arc/archive.org"});
        await arcDomain.p_register("archive.org", archiveOrgDomain, verbose);
        //TODO-DOMAIN add ipfs address and ideally ipns address to archiveOrgDetails record
        const archiveOrgDetails = await Name.p_new({urls: ["https://dweb.me/examples/archive.html"]}, verbose);
        await archiveOrgDomain.p_register("details", archiveOrgDetails, verbose);
        const archiveOrgMetadata = await Domain.p_new({_acl: kc}, true, {passphrase: pass+"/arc/archive.org/metadata"});
        //Lazy gateway is going to have to be at e.g. https://dweb.me/name/archiveid?key=commute"
        archiveOrgMetadata.tablepublicurls.push(metadatagateway);
        await archiveOrgDomain.p_register("metadata", archiveOrgMetadata, verbose);
        await Domain.root.p_resolve("arc/archive.org/details", {verbose}); // Geta a Name -> HTML file, figure out how to bootstrap from that.
        verbose=true;
        if (verbose) console.log("Next line should attempt to find in metadata table *YJS or HTTP) then try name/archiveid?key=commute");
        let res = await Domain.root.p_resolve("arc/archive.org/metadata/commute", {verbose});
        console.log(res);
        console.log("---Expect failure to resolve 'arc/archive.org/details/commute'", {verbose});
        //TODO-DOMAIN dont think next will work.
        try { //TODO-DOMAIN will need to figure out what want this to do
            await Domain.root.p_resolve("arc/archive.org/details/commute", {verbose});
        } catch(err) {
            console.log("Got errror",err);
        }
        console.log('------');
    }


    static async p_test(verbose) {
        if (verbose) console.log("KeyValueTable testing starting");
        try {
            const pass = "Testing pass phrase";
            //Register the toplevel domain
            // Set mnemonic to value that generates seed "01234567890123456789012345678901"
            const mnemonic = "coral maze mimic half fat breeze thought champion couple muscle snack heavy gloom orchard tooth alert cram often ask hockey inform broken school cotton"; // 32 byte
            const kc = await Dweb.KeyChain.p_new({name: "test_keychain kc"}, {mnemonic: mnemonic}, verbose);    //Note in KEYCHAIN 4 we recreate exactly same way.
            Domain.root = await Domain.p_new({
                fullname: "",   // Root is "" so that [fullname,name].join('/' is consistent for next level.
                keys: [],
                signatures: [],    // TODO-NAME Root record itself needs signing - but by who (maybe /arc etc)
                expires: undefined,
                _acl: kc,
                _map: undefined,   // May need to define this as an empty KVT
            }, true, {passphrase: pass+"/"}, verbose);   //TODO-NAME will need a secure root key
            //Now register a subdomain
            const testingtoplevel = await Domain.p_new({_acl: kc}, true, {passphrase: pass+"/testingtoplevel"});
            await Domain.root.p_register("testingtoplevel", testingtoplevel, verbose);
            const adomain = await Domain.p_new({_acl: kc}, true, {passphrase: pass+"/testingtoplevel/adomain"});
            await testingtoplevel.p_register("adomain", adomain, verbose);
            const item1 = await new Dweb.SmartDict({"name": "My name", "birthdate": "2001-01-01"}).p_store();
            await adomain.p_register("item1", item1, verbose);
            // Now try resolving on a client - i.e. without the Domain.root privte keys
            const ClientDomainRoot = await Dweb.SmartDict.p_fetch(Domain.root._publicurls, verbose);
            let res= await ClientDomainRoot.p_resolve('testingtoplevel/adomain/item1', {verbose});
            if (verbose) console.log("Resolved to",res);
            console.assert(res.urls[0] === item1._urls[0]);
            // Now some failure cases / errors
            if (verbose) console.log("-Expect unable to completely resolve");
            res= await Domain.root.p_resolve('testingtoplevel/adomain/itemxx', {verbose});
            console.assert(typeof res === "undefined");
            if (verbose) console.log("-Expect unable to completely resolve");
            res= await Domain.root.p_resolve('testingtoplevel/adomainxx/item1', {verbose});
            console.assert(typeof res === "undefined");
            if (verbose) console.log("-Expect unable to completely resolve");
            res= await Domain.root.p_resolve('testingtoplevelxx/adomain/item1', {verbose});
            console.assert(typeof res === "undefined");
            if (verbose) console.log("Structure of registrations");
            if (verbose) console.log(await Domain.root.p_printable());
            //TODO-NAME build some more failure cases (bad key, bad fullname)
            //TODO-NAME add http resolver for items to gateway and test case here
            //TODO-NAME try resolving on other machine
            await this.p_setupOnce(verbose);
        } catch (err) {
            console.log("Caught exception in Domain.test", err);
            throw(err)
        }
    }


}
NameMixin.call(Domain.prototype);   // Add in the Mixin
SignatureMixin.call(Domain.prototype, ["tablepublicurls", "fullname", "keys", "expires"]);

Domain.clsName = Name;  // Just So exports can find it and load into Dweb TODO move to own file

exports = module.exports = Domain;
